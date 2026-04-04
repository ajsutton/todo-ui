// API call functions

export async function markComplete(id) {
  const res = await fetch('/api/complete/' + id, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
}

export async function markIncomplete(id) {
  const res = await fetch('/api/incomplete/' + id, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
}

export async function updatePriority(id, priority) {
  const res = await fetch('/api/priority/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function updateSubPriority(parentId, repo, number, priority) {
  const res = await fetch('/api/sub-priority/' + parentId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, number, priority }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function updateDue(id, due) {
  const res = await fetch('/api/due/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ due }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function updateType(id, type) {
  const res = await fetch('/api/type/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function updateDescription(id, description) {
  const res = await fetch('/api/description/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error(await res.text());
}
