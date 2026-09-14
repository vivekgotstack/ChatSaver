// Focused crash/retry regression check; no browser or user vault is opened.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/db/note-drafts.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const storage = new Map();
const committed = new Map();
let sequence = 0;
let beforeWrite = async () => {};
const database = {
  db: { name: "guest" },
  ChatSaverDatabase: class { constructor(name) { this.name = name; } close() {} },
  updateNoteTitle: async (id, title, vault) => { await beforeWrite(); committed.set(`${vault.name}:${id}`, { title }); },
  updateNoteBlock: async (id, value, vault) => { await beforeWrite(); committed.set(`${vault.name}:${id}`, value); },
};
function launch() {
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => name === "./database" ? database : { createClientUuid: () => String(++sequence) },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
      key: (index) => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    },
    setTimeout: () => ++sequence,
    clearTimeout: () => {},
  });
  return exports;
}

(async () => {
  let app = launch();
  const key = app.draftKey("guest", "block", false);
  app.stageDraft("guest", "block", "note", { question: "Question typed", answer: "Last keystroke" });
  assert.equal(JSON.parse(storage.get(key)).value.answer, "Last keystroke", "journal must exist before the save timer");
  // Kill the runtime without blur/unmount/pagehide and open a fresh one.
  app = launch();
  await app.flushNoteDrafts("guest");
  assert.equal(committed.get("guest:block").answer, "Last keystroke");
  assert.equal(storage.size, 0);

  let release;
  beforeWrite = () => new Promise((resolve) => { release = resolve; });
  app.stageDraft("guest", "block", "note", { question: "", answer: "older write" });
  const first = app.flushDraft(key);
  app.stageDraft("guest", "block", "note", { question: "", answer: "newest write" });
  release();
  await first;
  assert.equal(JSON.parse(storage.get(key)).value.answer, "newest write", "older commits must not clear newer drafts");
  beforeWrite = async () => {};
  await app.flushDraft(key);
  assert.equal(committed.get("guest:block").answer, "newest write");

  beforeWrite = async () => { throw new Error("Disk temporarily unavailable"); };
  app.stageDraft("guest", "block", "note", { question: "", answer: "retry me" });
  await assert.rejects(app.flushDraft(key), /temporarily unavailable/);
  assert.equal(app.draftState(key), "error");
  assert.equal(JSON.parse(storage.get(key)).value.answer, "retry me");
  beforeWrite = async () => {};
  await app.flushDraft(key);
  assert.equal(committed.get("guest:block").answer, "retry me");
  assert.equal(app.draftState(key), "saved");

  app.stageDraft("account-a", "list", "note", { question: "", answer: "- [ ] still typing\n- [x] done" });
  database.db.name = "account-b";
  await app.flushNoteDrafts("account-a");
  assert.equal(committed.get("account-a:list").answer, "- [ ] still typing\n- [x] done");
  assert.equal(committed.has("account-b:list"), false, "delayed writes must stay in their original vault");
  assert.equal(storage.size, 0);
  console.log("Draft recovery, overlapping saves, failed-write retry, and vault isolation passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
