# @kotahbase/sdk

Official JavaScript/TypeScript SDK for KotahBase.

## Install

```bash
npm install @kotahbase/sdk
# or copy the source for now
```

## Quick Start

```ts
import { KotahBase } from "@kotahbase/sdk";

const kb = new KotahBase({
  url: "https://kotahbase-api.onrender.com",
  projectId: "YOUR_PROJECT_ID",  // from dashboard
  apiKey: "kb_xxxxx",            // optional
});

// Auth
await kb.auth.signUp("user@email.com", "password123");
await kb.auth.signIn("user@email.com", "password123");
kb.auth.signInWithGoogle();   // redirects
kb.auth.signInWithGitHub();   // redirects

// Database
const rows = await kb.from("game_scores").select();
await kb.from("game_scores").insert({ player_name: "Ace", score: 100 });

// SQL
const result = await kb.sql("SELECT * FROM game_scores LIMIT 5");

// Storage
await kb.storage.upload("avatar.png", file);

// Edge Functions
const res = await kb.invoke("my-function", { hello: "world" });

// AI / Vector
await kb.ai.embed("Hello world", [0.1, 0.2, 0.3], { source: "docs" });
const hits = await kb.ai.search("hello");

// Realtime
const channel = kb.channel("chat-room");
channel.subscribe((msg) => console.log(msg));
channel.send({ text: "hi" });
```
