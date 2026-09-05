---

title: Speech Engine
subtitle: Add voice to your own chat agent or LLM with ElevenLabs.
------------------------------------------------------------------

## Overview

ElevenLabs Speech Engine adds voice capabilities to any chat agent. ElevenLabs handles speech-to-text and text-to-speech while your server provides the LLM logic. The SDK manages connection lifecycle, turn-taking, and interruption detection so you can focus on your agent's behavior.

<CardGroup cols={3}>
  <Card title="Quickstart" icon="duotone code" href="/docs/eleven-api/guides/cookbooks/speech-engine">
    Build a voice agent with the ElevenLabs SDK.
  </Card>

  <Card title="JavaScript SDK reference" icon="fa-brands fa-js" href="/docs/eleven-api/resources/libraries/speech-engine/javascript-sdk-reference">
    Classes, methods, and events for the JavaScript SDK.
  </Card>

  <Card title="Python SDK reference" icon="fa-brands fa-python" href="/docs/eleven-api/resources/libraries/speech-engine/python-sdk-reference">
    Classes, methods, and events for the Python SDK.
  </Card>
</CardGroup>

## How it works

Speech Engine connects your server to ElevenLabs over WebSocket. Each connection represents one conversation.

```mermaid
sequenceDiagram
    participant Browser
    participant ElevenLabs

    box Your Server
        participant SDK as Speech Engine SDK
        participant LLM
    end

    Browser->>ElevenLabs: User speaks (audio)
    ElevenLabs->>SDK: Transcript (WebSocket)
    SDK->>LLM: Conversation history
    LLM->>SDK: Streamed response
    SDK->>ElevenLabs: Text chunks
    ElevenLabs->>Browser: Agent speaks (audio)
```

1. A user speaks in the browser. ElevenLabs captures the audio and transcribes it.
2. The transcript is sent to your server along with the full conversation history.
3. Your server passes the transcript to your LLM and streams the response back.
4. ElevenLabs converts the text to speech and plays it in the browser.

## When to use Speech Engine

Speech Engine is designed for developers who want to bring their own LLM and control the conversation logic on their own server. Use it when you need to:

* Add voice to an existing text-based chat agent
* Use a specific LLM, fine-tuned model, or custom inference pipeline
* Keep full control over conversation routing, context management, and tool calling
* Integrate voice into an existing server application (Express, FastAPI, etc.)

If you want a fully hosted solution where ElevenLabs provides the LLM, knowledge base, and tools, use [ElevenAgents](/docs/eleven-agents/overview) instead.

## Key features

* **Any LLM** - use OpenAI, Anthropic, Google Gemini, or any model that produces text. The SDK auto-extracts text from OpenAI, Anthropic, and Gemini stream formats.
* **Interruption handling** - when the user speaks mid-response, the SDK cancels the in-flight LLM request automatically via an `AbortSignal` (TypeScript) or task cancellation (Python).
* **Streaming** - responses are streamed to the browser as they are generated. Pass a string, an async iterable, or a native LLM stream object.
* **Turn-taking** - the SDK manages conversation turns, so your server only needs to respond to transcripts.

## IP allowlisting

If your server is behind a firewall or uses IP-based access controls, you can allowlist the static egress IPs from which ElevenLabs WebSocket connections originate. See [IP allowlisting](/docs/eleven-api/resources/ip-allowlisting) for the complete list of IP addresses.

<Tip>
  Using IP allowlisting ensures your server only accepts WebSocket connections from ElevenLabs'
  systems.
</Tip>

## FAQ

<AccordionGroup>
  <Accordion title="What LLMs are supported?">
    Any LLM that produces text. The SDK has built-in stream extraction for OpenAI (Responses API and
    Chat Completions API), Anthropic Messages API, and Google Gemini API. For other providers, pass
    a plain string or an async iterable of string chunks.
  </Accordion>

  <Accordion title="What is the difference between Speech Engine and ElevenAgents?">
    ElevenAgents is a fully hosted platform where ElevenLabs provides the LLM, knowledge base, and
    tools. Speech Engine is for developers who want to bring their own LLM and control the
    conversation logic on their own server.
  </Accordion>

  <Accordion title="What server frameworks are supported?">
    In TypeScript, you can attach Speech Engine to any Node.js HTTP server (Express, Fastify, or
    plain `http.createServer()`), or run a standalone WebSocket server. In Python, the SDK provides
    a standalone server via `engine.serve()`, or you can integrate with FastAPI, Starlette, or any
    ASGI framework using `engine.create_session()`.
  </Accordion>
</AccordionGroup>
