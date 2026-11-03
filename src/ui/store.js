// Holds the draft being edited, with undo/redo.
//
// Every change goes through set(), which keeps the previous draft on the undo
// stack. Drafts are small, so whole snapshots are simpler and safer than
// recording inverse commands. A drag (many small edits) is wrapped in
// begin()/end() so it undoes as one step.

const MAX_UNDO = 200;

export function createStore(initial) {
  let draft = initial;
  let undoStack = [];
  let redoStack = [];
  let groupStart = null; // draft at begin(), while a group is open
  const listeners = new Set();

  const notify = (reason) => listeners.forEach((fn) => fn(draft, reason));

  function push(prev) {
    undoStack.push(prev);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  return {
    get: () => draft,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // Apply an edit function (draft, ...args) => newDraft, or a new draft directly.
    apply(editOrDraft, ...args) {
      const next = typeof editOrDraft === 'function' ? editOrDraft(draft, ...args) : editOrDraft;
      if (next === draft) return;
      if (groupStart === null) push(draft);
      draft = next;
      notify('edit');
    },
    begin() {
      if (groupStart === null) groupStart = draft;
    },
    end() {
      if (groupStart === null) return;
      if (draft !== groupStart) push(groupStart);
      groupStart = null;
    },
    undo() {
      this.end();
      if (!undoStack.length) return;
      redoStack.push(draft);
      draft = undoStack.pop();
      notify('undo');
    },
    redo() {
      this.end();
      if (!redoStack.length) return;
      undoStack.push(draft);
      draft = redoStack.pop();
      notify('redo');
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
}
