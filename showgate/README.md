# ShowGate

**The room obeys the human. Claude runs the show inside the rules.**

ShowGate is the room connector between Claude and a Q-SYS Core. It speaks QRC, Q-SYS's own external control protocol (JSON-RPC over TCP, port 1710), and gives Claude a short list of tools with the crew's rules built in.

Concept by Ovi · built with Claude.

## The rules, in the code

1. **The human holds the switch.** `node mode.js on | watch | off`
   - **OFF:** Claude gets no access at all, not even to look.
   - **WATCH:** Claude can read the room, never change it.
   - **ON:** Claude can act.
   No file means OFF. There is no tool Claude can use to change the switch.
2. **Allowlist.** Claude can reach five channels (presenter, audience1, audience2, remote, playback) and four scenes (walkin, presentation, qa, brk). Nothing else exists for it.
3. **HUSH is locked twice.** ShowGate has no HUSH tool, and the Core design turns off external access to the HUSH logic, so even a direct QRC login is refused. HUSH is a button on the wall, wired to the Core, for humans.
4. **Nothing counts as done without a read-back.** Every move is set, then read back from the Core, and returned as `verified: true/false`. Claude is never its own witness.
5. **Everything is recorded twice.** The Core keeps its own audit log under Claude's own user name (`core-audit.log`), and ShowGate keeps a log of every call (`showgate.log`).

## Try it (no Windows, no hardware)

Needs Node.js 18 or newer.

```
npm install
node proof-run.js
```

`proof-run.js` starts the mock Core, connects a real MCP client to ShowGate, and runs a show. Claude recalls Q&A and opens mic 2, tries to reach HUSH and is refused twice, a human presses HUSH and every mic goes silent, WATCH and OFF are tested, and the network starts losing commands, which the read-back catches. Result on the bench: **16 passed, 0 failed.** The full transcript is in `proof-run.txt`.

## Use it with Claude Desktop

Add ShowGate to your Claude Desktop MCP settings (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "showgate": {
      "command": "node",
      "args": ["/full/path/to/showgate/showgate.js"],
      "env": { "QRC_HOST": "127.0.0.1", "QRC_PORT": "1710", "QRC_USER": "claude-mc", "QRC_PIN": "0001" }
    }
  }
}
```

Start the mock Core (`node mock-core.js`), switch the AI on (`node mode.js on`), and talk to Claude: "Q&A, open audience mic two."

## Point it at real Q-SYS

Set `QRC_HOST` to the Core's address, or to `localhost` for Q-SYS Designer in Emulate mode. Give Claude its own Q-SYS user. In the design:
- name the five channel components and the `Scenes` snapshot bank the same way, or edit the tables at the top of `showgate.js`;
- build HUSH as logic that gates the mic and remote outputs, with external access turned off;
- add a read-only `HushTally` indicator so Claude can see HUSH but never touch it.

## What is simulated, and still to check on real Q-SYS

The mock Core imitates QRC's shape. These are our assumptions until a real Core confirms them:
- the exact error codes (ours are simulated);
- that a component with external access turned off is refused over QRC, as it is for QRWC;
- how Q-SYS user permissions limit an external-control login;
- the `live` read-only control is our design idea. On real gear it would be a status pin or indicator you add to the design.

Emulate mode has no audio and no meters, so the first real test proves control and read-back, not sound.
