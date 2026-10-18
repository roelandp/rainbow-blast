import { App, button, h, Katrien, player, WalletBar, type Screen } from '../app'
import { audio } from '../audio'
import { pet, PETS, type PetId } from '../pets'

export function menuScreen(app: App): Screen {
  const save = app.save
  const scene = app.scene
  scene.setMood('day')
  scene.catPose('idle')
  // Show the island a little closer than in build mode.
  scene.setZoom(1.15)

  const title = h('h1', { class: 'title' })
  ;[...'Rainbow'].forEach((ch, i) => title.append(h('span', { style: `--i:${i}` }, ch)))
  title.append(h('br'), h('span', { class: 'blast' }, 'Blast'))

  const resume = Boolean(save.game && !save.game.over && save.game.score > 0)
  const play = button(resume ? '▶ Verder spelen' : '▶ Spelen', 'primary huge', () => app.go('play'))
  const island = button('🏝️ Mijn eiland', 'secondary huge', () => {
    audio.play('tap')
    app.go('island')
  })
  const sound = button(save.sound ? '🔊' : '🔇', 'round-btn sound', () => {
    save.sound = !save.sound
    audio.effects = save.sound
    sound.innerHTML = save.sound ? '🔊' : '🔇'
    app.persist()
    audio.play('tap')
  })
  const who = button(`👤 ${escape(player.name)}`, 'pill who', () => {
    audio.play('tap')
    openPlayers()
  })
  const wallet = new WalletBar(save.wallet)
  const record = h('div', { class: 'record' }, save.best > 0 ? `👑 Record: ${save.best}` : 'Zet blokjes op het bord en maak rijen vol!')
  const top = h('div', { class: 'menu-top' }, title, record)
  const actions = h('div', { class: 'menu-actions' }, play, island, wallet.el)
  const bubble = h('div', { class: 'bubble island-bubble' })
  const overlay = h('div', { class: 'overlay' })

  // Without WebGL, Katrien is a picture instead of standing on her island.
  const flat = app.has3d ? null : new Katrien('menu-kat')
  const el = h('div', { class: 'screen menu see-through' }, who, sound, top, ...(flat ? [flat.el] : []), actions, bubble, overlay)

  let alive = true
  let raf = 0
  let bubbleUntil = 0
  let bubbleTimer = 0
  function say(text: string, ms = 2600): void {
    if (flat) {
      flat.say(text, ms)
      return
    }
    window.clearTimeout(bubbleTimer)
    bubble.textContent = text
    bubble.classList.add('show')
    bubbleUntil = performance.now() + ms + 300
    bubbleTimer = window.setTimeout(() => bubble.classList.remove('show'), ms)
  }
  const follow = () => {
    if (!alive) return
    raf = requestAnimationFrame(follow)
    if (performance.now() > bubbleUntil) return
    const s = app.stage.getBoundingClientRect()
    const c = scene.catScreenPos()
    bubble.style.left = `${s.left + c.x}px`
    bubble.style.top = `${s.top + c.y - 40}px`
  }
  raf = requestAnimationFrame(follow)

  const offTap = app.onStageTap((x, y) => {
    if (!app.tapOnCat(x, y)) return
    audio.play(Math.random() < 0.5 ? 'meow' : 'purr')
    scene.catJump()
    scene.burst('hearts', 'cat')
    say(['Miauw!', `Hoi ${player.name}!`, 'Prrr...', 'Zullen we spelen?'][Math.floor(Math.random() * 4)], 1600)
  })
  const unwatch = app.watchInsets(top, actions)

  const hello = window.setTimeout(() => {
    say(resume ? 'Zullen we verder spelen?' : save.games === 0 ? `Hoi ${player.name}! Ik ben ${pet.name}.` : `Hoi ${player.name}! Nog een potje?`)
  }, 700)

  // ---- Players: everyone gets their own name, island, treasures and record ----
  function openPlayers(): void {
    const list = h('div', { class: 'players' })
    for (const p of app.profiles.list) {
      const row = h('div', { class: 'player-row' })
      row.append(
        button(`👤 ${escape(p.name)}`, `player ${p.id === app.profiles.current ? 'primary' : ''}`, () => {
          audio.play('tap')
          if (p.id !== app.profiles.current) app.switchProfile(p.id)
          app.go('menu')
        }),
        button('✏️', 'round-btn', () => editPlayer(p.id, p.name)),
      )
      list.append(row)
    }
    const card = h(
      'div',
      { class: 'card' },
      h('h2', {}, 'Wie speelt er?'),
      list,
      button('+ Nieuwe speler', 'secondary', () => editPlayer(null, '')),
      button('Sluiten', 'ghost small', closeOverlay),
    )
    showOverlay(card)
  }

  function editPlayer(id: string | null, name: string): void {
    audio.play('tap')
    const current = app.profiles.list.find((p) => p.id === id)
    let chosen: PetId = current?.pet ?? (app.profiles.list.length === 1 && !id ? 'kitnugget' : 'katrien')
    const input = h('input', { class: 'name-input', type: 'text', maxlength: '16', placeholder: 'Naam', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'done' })
    input.value = name
    const pets = h('div', { class: 'pet-pick' })
    const renderPets = () => {
      pets.innerHTML = ''
      for (const p of Object.values(PETS)) {
        const b = h('button', { class: `pet ${p.id === chosen ? 'on' : ''}`, type: 'button' }, h('img', { src: `${p.dir}beg.webp`, alt: '' }), h('span', {}, p.name))
        b.addEventListener('click', () => {
          chosen = p.id
          audio.play('tap')
          renderPets()
        })
        pets.append(b)
      }
    }
    renderPets()
    const done = () => {
      const n = input.value.trim().replace(/\s+/g, ' ').slice(0, 16)
      if (!n) {
        input.focus()
        return
      }
      audio.play('buy')
      if (id) app.editProfile(id, n, chosen)
      else app.addProfile(n, chosen)
      app.go('menu')
    }
    input.addEventListener('keydown', (e) => e.key === 'Enter' && done())
    const card = h(
      'div',
      { class: 'card' },
      h('h2', {}, id ? 'Speler veranderen' : 'Nieuwe speler'),
      h('p', {}, id ? 'Hoe heet je?' : 'Hoe heet je? Je krijgt je eigen eiland.'),
      input,
      h('p', {}, 'Met welke kat speel je?'),
      pets,
      h('div', { class: 'row' }, button('Klaar', 'primary', done), button('Terug', 'ghost', openPlayers)),
    )
    if (id && app.profiles.list.length > 1) card.append(button('Speler weghalen', 'ghost small', () => confirmDelete(id, name)))
    showOverlay(card)
  }

  function confirmDelete(id: string, name: string): void {
    audio.play('tap')
    const card = h(
      'div',
      { class: 'card' },
      h('h2', {}, `${escape(name)} weghalen?`),
      h('p', {}, 'Het eiland, de schatten en het record van deze speler zijn dan weg.'),
      h(
        'div',
        { class: 'row' },
        button('Ja, weghalen', 'secondary', () => {
          app.deleteProfile(id)
          app.go('menu')
        }),
        button('Nee', 'primary', openPlayers),
      ),
    )
    showOverlay(card)
  }

  function showOverlay(card: HTMLElement): void {
    overlay.innerHTML = ''
    overlay.append(card)
    overlay.classList.add('show')
  }
  function closeOverlay(): void {
    audio.play('tap')
    overlay.classList.remove('show')
  }

  return {
    el,
    destroy() {
      alive = false
      cancelAnimationFrame(raf)
      window.clearTimeout(hello)
      window.clearTimeout(bubbleTimer)
      offTap()
      unwatch()
      flat?.destroy()
      scene.setZoom(1)
    },
  }
}

/** Names go into button labels as HTML. */
function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
