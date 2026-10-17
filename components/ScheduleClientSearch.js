"use client";

import { useId, useMemo, useRef, useState } from "react";
import { filterScheduleClients } from "@/lib/scheduling/clientSearch.mjs";

// Search only inside already-loaded, admin-authorized client records.
// Never infer client identity from email: pass the selected record's exact key.
export default function ScheduleClientSearch({ clients, selectedClientKey, onChooseClient, disabled = false }) {
  const inputId = useId();
  const listId = useId();
  const inputRef = useRef(null);
  const selected = clients.find(client => client.key === selectedClientKey) || null;
  const [inputTerm, setInputTerm] = useState("");
  const [editing, setEditing] = useState(false);
  const term = editing ? inputTerm : selected
    ? [selected.clientName, selected.clientEmail].filter(Boolean).join(" — ")
    : "";
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const matches = useMemo(() => filterScheduleClients(clients, term), [clients, term]);
  const showingList = open && term.trim().length > 0;
  const highlightedClient = showingList ? matches[highlighted] : null;

  function selectClient(client) {
    onChooseClient(client.key);
    setEditing(false);
    setOpen(false);
    setHighlighted(0);
  }

  function changeSearch(value) {
    setInputTerm(value);
    setEditing(true);
    setOpen(true);
    setHighlighted(0);
    if (selectedClientKey) onChooseClient("");
  }

  function onSearchKeyDown(event) {
    if (event.key === "Escape") {
      if (open) event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!term.trim()) return;
      event.preventDefault();
      setOpen(true);
      setHighlighted(current => Math.min(
        Math.max(current + (event.key === "ArrowDown" ? 1 : -1), 0),
        Math.max(matches.length - 1, 0)
      ));
      return;
    }
    if (event.key === "Enter" && open && term.trim()) {
      // Prevent accidental appointment form submission while searching.
      event.preventDefault();
      if (highlightedClient) selectClient(highlightedClient);
    }
  }

  return (
    <div className="schedule-client-search">
      <label htmlFor={inputId}>Client</label>
      <div className="schedule-client-search-input-row">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          type="search"
          autoComplete="off"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={showingList}
          aria-controls={listId}
          aria-activedescendant={highlightedClient ? listId + "-item-" + highlighted : undefined}
          value={term}
          placeholder="Search client name, email or phone"
          disabled={disabled}
          onChange={event => changeSearch(event.target.value)}
          onFocus={() => { if (!selected) setOpen(true); }}
          onBlur={event => {
            if (!event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget)) setOpen(false);
          }}
          onKeyDown={onSearchKeyDown}
        />
        {selectedClientKey && (
          <button type="button" className="schedule-client-clear" aria-label="Clear selected client"
            onClick={() => { onChooseClient(""); setInputTerm(""); setEditing(false); setOpen(false); inputRef.current?.focus(); }}>
            Clear
          </button>
        )}
        {showingList && (
          <div className="schedule-client-search-results" id={listId} role="listbox" aria-label="Matching clients">
            {matches.length ? matches.map((client, index) => (
              <button key={client.key} type="button" role="option"
                id={listId + "-item-" + index}
                aria-selected={index === highlighted}
                className={index === highlighted ? "schedule-client-result active" : "schedule-client-result"}
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectClient(client)}>
                <strong>{client.clientName}</strong>
                <span>{client.clientEmail || client.phone || "No contact details"}</span>
              </button>
            )) : <p className="schedule-client-search-hint">No matching clients. Try a different name or email.</p>}
            {matches.length === 12 && (
              <p className="schedule-client-search-hint">Showing up to 12 matches. Keep typing to narrow the results.</p>
            )}
          </div>
        )}
      </div>
      {selected && (
        <p className="schedule-client-search-selected" role="status">
          ✓ Selected: {selected.clientName}{selected.clientEmail ? " · " + selected.clientEmail : ""}
        </p>
      )}
      {!selected && <p className="schedule-client-search-hint">Choose an existing client to enable booking. Type at least one character.</p>}
    </div>
  );
}
