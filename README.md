# My Future Past

**An audio-player résumé.**  
*Lumină, nu vrăjeală. (Light, not deception.)*

A job application built as a vinyl record player. Three sides, narrated, in one HTML file — no framework, no bundler, no build step, no dependencies.

**🔗 Live:** https://ovidemetrian.github.io/my-future-past/

**🎬 For Anthropic's AV Production Specialist role:**

- **Run of Show** — résumé cued like a live production → https://ovidemetrian.github.io/my-future-past/anthropic/
- **Director's Desk** — the director calls the cue, Claude operates, HUSH stays human → https://ovidemetrian.github.io/my-future-past/desk/ ([README](desk/README.md))

**🔊 Live audio (playable):**

- [Play “Never_Let_AI_Finish_Your_Thoughts _.mp3”](https://raw.githubusercontent.com/ovidemetrian/my-future-past/main/Never_Let_AI_Finish_Your_Thoughts%20_.mp3)

<audio controls>
  <source src="https://raw.githubusercontent.com/ovidemetrian/my-future-past/main/Never_Let_AI_Finish_Your_Thoughts%20_.mp3" type="audio/mpeg">
  Your browser does not support the audio element. Click the link above to download or play the file.
</audio>

---

## The Three Sides

| Side | Contents |
|------|----------|
| **Résumé** | Contact · Business history from 1994 · Product development · Core technical skills |
| **Cover Letter** | From an earlier product application; the Anthropic version is in [Run of Show](https://ovidemetrian.github.io/my-future-past/anthropic/) |
| **Extra Stuff** | Portfolio — GGI framework, Ten Laws of AI, submissions and outreach |

Press play and the page reads itself aloud, highlighting each word as it's spoken. Transport controls work like a record player.

---

## What's Inside

- **Splash screen** — dismissed by tap or key
- **Word-by-word narration** — driven by browser's Web Speech API with highlighting
- **Spatial audio demonstration** — head-tracked binaural panning (shows what the work actually sounds like)
- **On The Record** — complete index of sites, frameworks, and tracks
- **The Bottom Line** — pocket studio with VU meters and gramophone
- **Three draggable objects:**
  - **Cassette** (hold 4 sec) → Opens spatial audio demo
  - **CD** (hold 4 sec) → Opens On The Record index
  - **Black vinyl, red label** (hold 4 sec) → Opens Möbius Bar Desk

Reduced-motion preferences honored throughout — every animation checks `prefers-reduced-motion` before running.

---

## Built With

**Vanilla HTML5 + CSS3 + JavaScript**  
One file, ~890 KB (audio & artwork embedded)  
Written entirely on an Android phone

30 years of audio-video integration inform the design principle: **The interface is the instrument** — technology disappears so the human experience remains.

---

## Technical Details

- **Single `index.html`** — no framework, no build process, no dependencies
- **Web Speech API** — native browser text-to-speech with word-highlighting
- **Web Audio API** — spatial audio with head-tracking (binaural panning)
- **Draggable DOM elements** — physics-based throwing with constraints
- **Accessibility-first** — keyboard navigation, `prefers-reduced-motion` honored
- **Zero external requests** — all audio and artwork embedded as data URIs
- **Mobile-optimized** — full touch support, responsive layout

---

## Deploy on GitHub Pages

1. Create a repository
2. Upload `index.html` and `README.md` to the root
3. **Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save**
4. The URL appears in the banner once the build finishes

The repository name becomes part of the URL and is case-sensitive.

---

## Also See

- **Möbius Bar Desk** (News verification with three checking agents) → https://ovidemetrian.github.io/mobiusbar/
- **GGI Control Panel** (AI governance framework, since December 2025) → https://ovidemetrian.github.io/GGI-GENIAL-GENUINE-INTELLIGENCE/
- **SONOS Panel** (room-first whole-home audio controller concept) → https://ovidemetrian.github.io/SONOS-panel/
- **NoEscape Navigator** (Dark pattern museum) → https://ovidemetrian.github.io/Netscape/
- **Ten Laws of AI** → https://10lawsofai.com

---

**Built by Ovidiu "Ovi" Demetrian**  
*GGI · Synthiosis · Eternal Bartender*

> "The interface is the instrument. Technology should disappear so the human experience remains."
