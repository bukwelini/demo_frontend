(() => {
  "use strict";

  const elements = {
    form: document.getElementById("noteForm"),
    editor: document.querySelector(".editor"),
    title: document.getElementById("title"),
    content: document.getElementById("content"),
    titleError: document.getElementById("titleError"),
    contentError: document.getElementById("contentError"),
    charCount: document.getElementById("charCount"),
    statusMessage: document.getElementById("statusMessage"),
    submitButton: document.getElementById("submitButton"),
    cancelButton: document.getElementById("cancelButton"),
    searchInput: document.getElementById("searchInput"),
    notesList: document.getElementById("notesList"),
    noteTemplate: document.getElementById("noteTemplate"),
    emptyState: document.getElementById("emptyState"),
    emptyTitle: document.getElementById("emptyTitle"),
    emptyMessage: document.getElementById("emptyMessage"),
    noteCount: document.getElementById("noteCount"),
  };

  const state = {
    notes: [],
    editingId: null,
    query: "",
  };

  let statusTimer = null;

  function showStatus(message, type = "") {
    window.clearTimeout(statusTimer);
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status${type ? ` status--${type}` : ""}`;

    if (message) {
      statusTimer = window.setTimeout(() => {
        elements.statusMessage.textContent = "";
        elements.statusMessage.className = "status";
      }, 3000);
    }
  }

  async function apiRequest(path, options = {}) {
    let response;

    try {
      response = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
    } catch {
      throw new Error("Could not connect to the backend.");
    }

    const payload = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || "Request failed.");
    }

    return payload;
  }

  async function loadNotes() {
    showStatus("Loading notes...");
    try {
      const notes = await apiRequest("/api/notes");
      state.notes = Array.isArray(notes) ? notes : [];
      renderNotes();
      showStatus("");
    } catch (error) {
      showStatus(error.message, "error");
    }
  }

  function setError(input, errorElement, message) {
    errorElement.textContent = message;
    if (message) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  function clearErrors() {
    setError(elements.title, elements.titleError, "");
    setError(elements.content, elements.contentError, "");
  }

  function validate(title, content) {
    const errors = {};
    if (!title) errors.title = "Title is required.";
    if (!content) errors.content = "Note is required.";
    return errors;
  }

  function updateCharCount() {
    elements.charCount.textContent = `${elements.content.value.length}/1000`;
  }

  function setBusy(isBusy) {
    elements.submitButton.disabled = isBusy;
    elements.cancelButton.disabled = isBusy;

    for (const button of elements.notesList.querySelectorAll("button")) {
      button.disabled = isBusy;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const title = elements.title.value.trim();
    const content = elements.content.value.trim();
    const errors = validate(title, content);

    setError(elements.title, elements.titleError, errors.title || "");
    setError(elements.content, elements.contentError, errors.content || "");

    if (Object.keys(errors).length > 0) return;

    const wasEditing = Boolean(state.editingId);
    setBusy(true);

    try {
      if (state.editingId) {
        const updated = await apiRequest(
          `/api/notes/${encodeURIComponent(state.editingId)}`,
          {
            method: "PUT",
            body: JSON.stringify({ title, content }),
          }
        );
        const index = state.notes.findIndex((note) => note.id === updated.id);
        if (index !== -1) state.notes[index] = updated;
      } else {
        const created = await apiRequest("/api/notes", {
          method: "POST",
          body: JSON.stringify({ title, content }),
        });
        state.notes.push(created);
      }

      resetEditor();
      renderNotes();
      showStatus(wasEditing ? "Note updated." : "Note added.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function resetEditor({ focus = false } = {}) {
    elements.form.reset();
    state.editingId = null;
    elements.submitButton.textContent = "Add note";
    elements.cancelButton.hidden = true;
    clearErrors();
    updateCharCount();
    if (focus) elements.title.focus();
  }

  function startEdit(id) {
    const note = state.notes.find((item) => item.id === id);
    if (!note) return;

    state.editingId = id;
    elements.title.value = note.title;
    elements.content.value = note.content;
    elements.submitButton.textContent = "Save changes";
    elements.cancelButton.hidden = false;
    clearErrors();
    updateCharCount();
    elements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.title.focus();
  }

  async function deleteNote(id) {
    const note = state.notes.find((item) => item.id === id);
    if (!note) return;

    if (!window.confirm(`Delete "${note.title}"?`)) return;

    setBusy(true);

    try {
      await apiRequest(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.notes = state.notes.filter((item) => item.id !== id);
      if (state.editingId === id) resetEditor();
      renderNotes();
      showStatus("Note deleted.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function createNoteElement(note) {
    const card = elements.noteTemplate.content.firstElementChild.cloneNode(true);
    const title = card.querySelector(".note__title");
    const content = card.querySelector(".note__content");
    const date = card.querySelector(".note__date");
    const editButton = card.querySelector('[data-action="edit"]');
    const deleteButton = card.querySelector('[data-action="delete"]');
    const createdAt = Number(note.created_at);
    const updatedAt = Number(note.updated_at);
    const timestamp = updatedAt > createdAt ? updatedAt : createdAt;
    const label = updatedAt > createdAt ? "Updated" : "Created";

    card.dataset.id = note.id;
    title.textContent = note.title;
    content.textContent = note.content;
    date.dateTime = new Date(timestamp).toISOString();
    date.textContent = `${label} ${formatDate(timestamp)}`;
    editButton.setAttribute("aria-label", `Edit note: ${note.title}`);
    deleteButton.setAttribute("aria-label", `Delete note: ${note.title}`);

    return card;
  }

  function renderNotes() {
    const query = state.query.trim().toLowerCase();
    const visibleNotes = [...state.notes]
      .sort((a, b) => b.updated_at - a.updated_at)
      .filter((note) => {
        if (!query) return true;
        return (
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query)
        );
      });

    elements.notesList.replaceChildren();

    for (const note of visibleNotes) {
      elements.notesList.appendChild(createNoteElement(note));
    }

    elements.noteCount.textContent = `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`;
    elements.emptyState.hidden = visibleNotes.length > 0;
    elements.emptyTitle.textContent = query ? "No matching notes" : "No notes yet";
    elements.emptyMessage.textContent = query
      ? "Try a different search term."
      : "Add your first note using the form above.";
  }

  elements.form.addEventListener("submit", handleSubmit);
  elements.cancelButton.addEventListener("click", () => resetEditor());

  elements.title.addEventListener("input", () => {
    setError(elements.title, elements.titleError, "");
  });

  elements.content.addEventListener("input", () => {
    setError(elements.content, elements.contentError, "");
    updateCharCount();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderNotes();
  });

  elements.notesList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const card = button.closest(".note");
    if (!card) return;

    if (button.dataset.action === "edit") startEdit(card.dataset.id);
    if (button.dataset.action === "delete") deleteNote(card.dataset.id);
  });

  loadNotes();
})();
