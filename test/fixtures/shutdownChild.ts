// Fixture spawned as a real child process by shutdown.test.ts — not a test
// itself. Opens the real DB (installing the SIGTERM/SIGINT hook from db.ts),
// writes something, then blocks so the parent can send a signal and observe
// how the process actually reacts to it (something a same-process unit test
// calling closeDb() directly can never exercise).

import { getDb } from "../../src/server/db";

const db = getDb();
db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("shutdown-test", "1");

process.stdout.write("READY\n");

// Keep the event loop alive until a signal arrives; db.ts's hooked handler
// calls closeDb() + process.exit(0).
setInterval(() => {}, 60_000);
