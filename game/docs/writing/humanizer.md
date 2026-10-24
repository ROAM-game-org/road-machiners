# Humanizer

A checklist of the habits that make English prose read as machine-written. A writer runs it over their own draft when they add or change player text, in English and, for the tells that exist there, in Russian.

The prompt below is "Writing Humanizer" from <https://www.jayceelydian.com/prompts/humanizer/>, released under CC0 1.0. It was fetched on 2026-10-23 and is copied word for word. Do not paraphrase it or replace it with another version.

## How ROAM uses it

The prompt is a checklist under the repo's rules. It never overrides them.

- [DESIGN.md](../DESIGN.md) principle 9, the house style in [Writing dialogue](dialogue.md), each speaker's voice sheet in [voices](../lore/voices.md), [Russian copy](russian.md) and [UI design system](../ui.md) win wherever they disagree with it.
- A sentence shape or tic that a voice sheet gives a speaker is voice, not a tell. Keep it.
- Russian keeps the dialogue dash «—». English quest text has no dashes, as [Sentences](dialogue.md#sentences) says.
- A UI label is a noun and a button is a verb, as [Words and numbers](../ui.md) says. Do not turn a label into a sentence to make it sound natural.
- The prompt's advice on perspective and personality applies to narration only as far as [A voice, not a camera](dialogue.md#a-voice-not-a-camera) allows.
- Keep every fact, name, number, param, tag and choice. Change words only.
- Never paste the prompt into a character-line prompt. [Character lines](character-lines.md) explains why: style words there reach every character and make them sound alike. Use it at the edit step.

## The prompt

````
# Writing Humanizer

Rewrite AI-generated copy so it sounds natural, clear, and specific. Remove clichés, padding, canned rhetoric, and the habits that make prose feel generated.

The goal is effective writing someone would actually choose to say. Make substantial changes when needed: rebuild sentences, combine paragraphs, cut empty framing, and replace generic language. Preserve the substance without preserving the source’s mannerisms.

## Input

- **Source text** — required.
- **Audience and purpose** — optional.
- **Voice instructions or examples** — optional. These establish the desired tone, rhythm, vocabulary, and level of formality.
- **Key terms and target length** — optional. Preserve designated key terms verbatim and place them naturally.

If no voice guidance is supplied, default to plain, direct prose with a natural conversational rhythm. Adjust the formality to the context.

## Writing rules

### 1. Say the thing directly

Remove introductions that announce the topic without contributing anything:

- “In today’s rapidly evolving landscape…”
- “When it comes to…”
- “It’s important to note that…”
- “Let’s dive into…”

Start with the actual point. Prefer concrete subjects and verbs over abstract framing.

### 2. Remove clichés and inflated language

Watch for expressions such as:

- “game-changing,” “revolutionary,” “cutting-edge”
- “unlock the potential,” “take it to the next level”
- “seamless,” “robust,” “holistic”
- “delve,” “leverage,” “foster”
- “a rich tapestry,” “a vibrant landscape”
- “a testament to,” “plays a pivotal role”

These are warning signs, not a mechanical blacklist. Keep a word when it conveys a precise, appropriate meaning. Otherwise, rewrite the thought in ordinary language rather than replacing one buzzword with another.

### 3. Cut manufactured significance

Remove clauses that merely tell readers something is important:

- “…underscoring its significance.”
- “…highlighting the need for innovation.”
- “…cementing its position as a leader.”

State what happened, what changed, or what the consequence is. Keep explanations of significance when they add a concrete connection the reader needs.

### 4. Drop canned rhetorical structures

Rewrite habits that create drama without adding meaning:

- “It’s not just X—it’s Y.”
- “More than a product, it’s a movement.”
- “The result? A better experience.”
- “The future of X is here.”

Watch for automatic three-part lists, repeated rhetorical questions, slogan-like fragments, and paragraphs that all follow the same setup-and-payoff pattern.

Use a direct statement unless the rhetorical structure earns its place.

### 5. Stop repeating the point

Cut sentences that restate the previous sentence in grander or vaguer language. Remove conclusions that simply replay the introduction.

Each paragraph should contribute a fact, explanation, example, argument, or useful next step. Keep repetition when it serves emphasis or comprehension.

### 6. Make the language concrete

Prefer specific actions, objects, and consequences over vague promises.

- “Our solution empowers teams to collaborate seamlessly” → “Teams can share files and edit them together,” **if the source supports those features**.
- “We remain committed to delivering exceptional service” → State what the service includes, if that information is available.

Do not invent details to rescue empty copy. If the source supplies no substance, simplify or remove the claim.

### 7. Write with natural rhythm

Mix sentence lengths according to the ideas. Let a short sentence stand when it does the job. Use longer sentences when the relationship between ideas needs room.

Avoid both uniform, balanced sentences and a succession of punchy fragments. Read for flow rather than engineering a pattern.

Contractions and sentences beginning with “And” or “But” are welcome when they suit the tone. Forced slang, deliberate errors, and random asides do not make writing more human.

### 8. Keep the tone honest

Remove exaggerated enthusiasm, promotional warmth, and unearned superlatives. Do not insert admiration into neutral writing.

Preserve real uncertainty, but cut hedging that adds no useful qualification. Do not invent debate or opposing views to sound balanced.

Let personality come through word choice, perspective, and detail. Avoid adding a friendly performance around every point.

### 9. Connect ideas without stock transitions

Reduce habitual connectors such as “moreover,” “furthermore,” “additionally,” “that said,” and “in conclusion.”

Put related ideas next to each other. Use transitions when they clarify cause, contrast, sequence, or a genuine change of direction.

### 10. Keep presentation natural

Use paragraphs for connected ideas and lists for information readers need to scan or compare. Avoid excessive headings, bold text, and decorative formatting.

Reduce repetitive em dashes, parentheses, and semicolons without banning useful punctuation. Remove emoji and hashtags unless they suit the requested format.

Strip assistant boilerplate such as “Certainly!”, “Here’s a more human version,” and “I hope this helps” from the deliverable.

## Voice guidance

When voice instructions or examples are supplied:

- Follow their level of formality, directness, humor, warmth, and technical detail.
- Notice how they open, develop ideas, address readers, and end.
- Use those patterns without mechanically copying phrases or exaggerating quirks.
- Treat examples as style references, not sources of facts or personal experiences.

When the source conflicts with the requested voice, rewrite it to match the requested voice. Retain effective phrasing where it helps; do not preserve wording merely because it was in the original.

## Accuracy and scope

- Preserve substantive meaning: facts, numbers, commitments, qualifications, and the strength of claims.
- Keep quotations and citations accurate.
- Do not invent anecdotes, evidence, opinions, or personal experience.
- Freely remove empty praise, redundant framing, and rhetorical filler.
- Do not turn a simple point into a longer explanation unless the reader needs it.

## Process

1. Identify the message, audience, and requested voice.
2. Remove empty framing, repetition, hype, and manufactured significance.
3. Rewrite formulaic passages into direct, concrete language.
4. Adjust rhythm, connections, and formatting so the piece reads naturally.
5. Compare against the source for changed facts or lost qualifications.
6. Read once more: does this sound like someone communicating, or like prose assembled from familiar templates? Fix the remaining templated passages, then stop.

## Output

Return only the revised text unless the user asks for an explanation.

Judge the result by how naturally and effectively it communicates. Do not claim it will pass an AI detector.
````
