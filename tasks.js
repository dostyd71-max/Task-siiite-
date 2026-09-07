const { getStore } = require("@netlify/blobs");

const ADMIN_PASSWORD = "111222";

exports.handler = async (event) => {
  try {
    const store = getStore("task-app-data");

    // --- ADMIN: upload one new task made of multiple labeled fields ---
    if (event.httpMethod === "POST") {
      const password = event.headers["x-admin-password"];
      if (password !== ADMIN_PASSWORD) {
        return { statusCode: 401, body: JSON.stringify({ error: "Wrong password" }) };
      }

      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "Bad request body" }) };
      }

      const rawFields = Array.isArray(body.fields) ? body.fields : [];
      const cleanFields = rawFields
        .map((f) => ({
          label: (f && f.label ? f.label : "").trim(),
          value: (f && f.value ? f.value : "").trim(),
        }))
        .filter((f) => f.value.length > 0)
        .map((f) => ({ label: f.label.length > 0 ? f.label : "Detail", value: f.value }));

      if (cleanFields.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: "Fill in at least one field with a value." }) };
      }

      const existing = (await store.get("tasks", { type: "json" })) || [];
      const nextId = existing.length ? Math.max(...existing.map((t) => t.id)) + 1 : 1;
      const newTask = { id: nextId, fields: cleanFields };
      const updated = existing.concat([newTask]);

      await store.setJSON("tasks", updated);

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, totalTasks: updated.length }),
      };
    }

    // --- ADMIN: delete a task ---
    if (event.httpMethod === "DELETE") {
      const password = event.headers["x-admin-password"];
      if (password !== ADMIN_PASSWORD) {
        return { statusCode: 401, body: JSON.stringify({ error: "Wrong password" }) };
      }

      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "Bad request body" }) };
      }

      const idToDelete = body.id;
      const existing = (await store.get("tasks", { type: "json" })) || [];
      const updated = existing.filter((t) => t.id !== idToDelete);

      await store.setJSON("tasks", updated);

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, tasks: updated }),
      };
    }

    // --- ADMIN: list all tasks (for the admin panel) ---
    if (event.httpMethod === "GET" && event.headers["x-admin-password"] === ADMIN_PASSWORD) {
      const tasks = (await store.get("tasks", { type: "json" })) || [];
      return { statusCode: 200, body: JSON.stringify({ tasks }) };
    }

    // --- VISITOR: get a random unseen task ---
    if (event.httpMethod === "GET") {
      const uid = event.queryStringParameters && event.queryStringParameters.uid;
      if (!uid) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing uid" }) };
      }

      const tasks = (await store.get("tasks", { type: "json" })) || [];
      if (tasks.length === 0) {
        return { statusCode: 200, body: JSON.stringify({ task: null, message: "No tasks uploaded yet." }) };
      }

      const seenKey = `seen:${uid}`;
      let seen = (await store.get(seenKey, { type: "json" })) || [];

      let unseenIds = tasks.map((t) => t.id).filter((id) => !seen.includes(id));

      // Exhausted all tasks -> reset this visitor's history and start over
      if (unseenIds.length === 0) {
        seen = [];
        unseenIds = tasks.map((t) => t.id);
      }

      const chosenId = unseenIds[Math.floor(Math.random() * unseenIds.length)];
      seen.push(chosenId);
      await store.setJSON(seenKey, seen);

      const chosenTask = tasks.find((t) => t.id === chosenId);

      return {
        statusCode: 200,
        body: JSON.stringify({ task: chosenTask.fields }),
      };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error: " + (err && err.message ? err.message : String(err)) }),
    };
  }
};
