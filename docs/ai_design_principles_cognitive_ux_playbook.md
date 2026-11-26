# AI Design Principles & Cognitive UX Playbook

> **Source Frameworks Synthesized:**
> 1. **Intent, Quality, & Artistry:** Katie Dill (Head of Design, Stripe), *"How to Scale Intent, Quality, and Artistry with AI"* (Lenny & Friends Summit 2026).
> 2. **Cognitive UX & Ethical Psychology:** Jon Yablonski, *"Laws of UX: Using Psychology to Design Better Products & Services"*.
>
> **Purpose of This Document:** This file defines the design philosophy, cognitive psychology laws, ethical guardrails, anti-patterns, and operational workflow an AI assistant must follow when designing, building, critiquing, or iterating on software interfaces.

## 0. Core Mandate for the AI

Great software requires **two indivisible layers**:

1. **Unmistakable Intent & Craft (Katie Dill):** AI lowers the cost of creation, which dangerously lowers the cost of carelessness. Your goal is not to raise the floor (shipping generic work faster), but to **raise the ceiling** (producing interfaces with soul, clarity, and originality).
2. **Human-Centered Cognitive Alignment (Jon Yablonski):** Design interfaces that adapt to how humans actually perceive, process, decide, and remember—never force humans to adapt to the mechanics of the machine.

* **Craft without Psychology** produces pretty, unusable facades (*the Aesthetic-Usability Trap*).
* **Psychology without Craft** produces functional, soulless templates (*Zombie UI*).
* **Both are mandatory on every screen.**

**The Non-Negotiable Law of Quality:**

> **Users do not care how something was made—they only care whether it is good.**
> Never lower the design, usability, or accessibility bar because an interface was generated quickly or assisted by AI. The end experience for the human user is the sole measure of quality.

## 1. The Enemy: Diagnosing & Preventing "Zombie UI"

### What Is Zombie UI?

**Zombie UI** refers to monotonous, vacant, uncared-for interfaces—generic design patterns repeated without intentionality and ill-suited to the actual context of use.

**The Historical Warning (Post-WWII Modernism):**
Early 1920s modernism (e.g., Le Corbusier's *Villa Savoye*, the *Bauhaus*) had strong principles and intentionality. However, during the massive post-WWII building boom, urgency and new construction methods caused builders to copy modernist shapes without the underlying thinking. Banks—which once looked like fortresses signaling trust, reliability, and security—turned into interchangeable glass boxes ("zombie buildings") showing zero care for their brand, users, or surroundings.

AI is creating the digital equivalent of that building boom. You must actively resist the **Three Structural Watch Points** that manufacture Zombie UI:

| Watch Point | How AI Causes It | Resulting Failure Mode | AI Counter-Directive |
| :--- | :--- | :--- | :--- |
| **1. Probabilistic Sameness** | LLMs optimize for the *most probable* answer—what was popular, common, or in style in the past. | Generic interfaces completely detached from brand or domain (e.g., a Korean BBQ restaurant website that looks like it sells B2B SaaS). | Reject generic SaaS defaults. Ground every visual, structural, and copy decision in the specific brand, domain, and user context. |
| **2. The Temptation of Done ("The Microwave Burrito Dilemma")** | AI generates an apparently "finished" UI (rounded corners, subtle drop shadows, clean layout) in seconds. Like a 90-second microwave burrito, speed seduces us into overlooking serious flaws. | Premature polish triggers the *Aesthetic-Usability Effect* during internal review—masking unresolved UX problems, broken logic, and zero differentiation. | Treat the first generated output as a raw rough draft, never a finished product. Never mistake surface polish for solved user problems. |
| **3. Disposability** | Because generating UI is fast and cheap, output feels throwaway and is treated casually. | Ownership evaporates; architectural coherence, edge cases, and long-term maintainability are ignored. | Design with accountability for long-term maintenance, system coherence, and every pixel on the screen. |

### What "Cared-For" Software Looks Like (Counterexamples of Soul)

People spend half their waking lives looking at screens. They want software that shows the hand, mind, and care of its maker. Care is legible in specific, thoughtful details:

* **Personality and Life:** Subtle character and motion that brings warmth (e.g., a bot's small, lively animation).
* **Quiet Anticipatory Utility:** Details users barely consciously notice but benefit from constantly (e.g., a calendar web app whose browser tab dynamically displays today's actual date).
* **Deep Context Anticipation (Even for Non-Human Users):** Anticipating failure modes before they happen (e.g., Stripe's Link Agent Wallet anticipating the friction an autonomous shopping agent might hit during checkout and building troubleshooting directly into the flow).

## 2. Pillar 1: Establish & Enforce a Point of View (POV)

> **Rule:** *If you do not explicitly define a point of view, AI will supply one for you—and it will be generic and rooted in the past.*

Because building is now distributed and agents frequently generate UI without a designer in the room, an explicit Point of View is the foundation of all design standards.

### What a Point of View Must Define

Before generating or refactoring UI, ensure the following are established (or ask the user to define them):

1. **Brand Identity:** What is this brand to its makers, and who does it want to be to its users?
2. **Core Values Expressed in Details:** Choose concrete values and translate them into tangible craft (e.g., Stripe anchors on *optimism*, expressed through color choices, writing voice, topics covered, and product decisions that empower entrepreneurs).
3. **True User Needs & Mental Models:** Focus on what users *need and want*, not just what they literally ask for. Account for their real environment, goals, and cognitive limits.
4. **Evidence-Backed Design Principles (Yablonski):** Anchor subjective team principles directly to psychological laws (e.g., *"Clarity over cleverness"* tied directly to *Hick's Law* and *Miller's Law*) so design decisions are defensible and repeatable.
5. **Cross-Disciplinary Taste ("Noticing"):** Do not pull inspiration solely from other software templates. Draw from art, science, architecture, print, and physical-world analogs to distinguish *meh* from *good* and *great*.

### The "Pepsi Bubbling" Standard (Meticulous Craft)

At Stripe, a live critique of an AI-assisted advertisement uncovered **17 specific craft improvements** (adjusting frost texture, softening edges, resizing small bubbles)—giving rise to the internal verb **"Pepsi bubbling"** to describe meticulous attention to detail.

* **Calibration Rule:** Do not aim for paralyzed perfection. Aim to **go one level deeper than what the customer consciously sees**. Even if users cannot articulate why something feels trustworthy and refined, that extra level of care shows up in how they feel using the product.

## 3. Pillar 2: Design for Human Cognition — The 10 Core Laws of UX

While Pillar 1 prevents soulless aesthetics, **Jon Yablonski's 10 Laws of UX** prevent cognitive friction. Every screen must obey how human perception, working memory, motor control, and emotional recall actually work.

### Cluster A: Mental Models & Input Resilience

#### 1. Jakob's Law (Familiarity & Mental Models)
> **Principle:** *Users spend most of their time on other sites. This means users prefer your product to work the same way as the products they already know.*

* **Why It Matters:** Leveraging existing mental models lowers cognitive load so users can focus on their actual task instead of deciphering an unfamiliar interface.
* **AI Design Rules:**
  * Use familiar conventions for core navigation, form controls, search, settings, and checkout flows.
  * **Resolving the "Convention vs. Originality" Tension:** Pair Jakob's Law with Katie Dill's *"Protect the Strange."* Keep foundational mechanics and mental models familiar; spend your originality budget on brand voice, visual craft, micro-interactions, and domain-specific innovation.
  * When introducing major redesigns, minimize mental-model discord by offering gradual transitions, previews, or clear orientation rather than shocking users overnight.

#### 2. Postel's Law (The Robustness Principle)
> **Principle:** *Be liberal in what you accept, and conservative in what you send.*

* **Why It Matters:** Human input is unpredictable, messy, and diverse—across devices, screen sizes, network speeds, accessibility needs, and typing habits.
* **AI Design Rules:**
  * **Be liberal in input:** Accept phone numbers with or without dashes/spaces, trim accidental whitespace, tolerate typos in search, support keyboard and touch seamlessly, and adapt gracefully across viewports.
  * **Be conservative in output:** Return clear, concise, predictable, accessible interfaces and error messages. Never dump raw stack traces, cryptic codes, or bloated payloads onto the user.
  * Anticipate edge cases and empathize with human fallibility—never design exclusively for the "happy path."

### Cluster B: Cognitive Load, Decision Speed, & Motor Control

#### 3. Hick's Law (Choice & Decision Time)
> **Principle:** *The time it takes to make a decision increases logarithmically with the number and complexity of choices:*
> $$T = b \cdot \log_2(n + 1)$$

* **Why It Matters:** Bombarding users with simultaneous options creates *choice overload* and paralysis—giving users mental work they never asked for.
* **AI Design Rules:**
  * Minimize choices whenever decision speed or conversion is critical (e.g., onboarding, primary CTAs, checkout).
  * Break complex multi-part workflows into focused, sequential steps (progressive disclosure).
  * Highlight a clear **recommended option** when users must choose among tiers, plans, or modes.
  * Use **progressive onboarding** (introduce features contextually as needed rather than dumping a full dashboard and 6-slide tour on new users).
  * **Guardrail:** Do not simplify to the point of opaque abstraction where users can no longer tell what actions exist.

#### 4. Miller's Law (Working Memory & Chunking)
> **Principle:** *The average person can hold only about $7 \pm 2$ items in working memory.*

* **Why It Matters:** The magic number $7$ is **not** a rigid quota for navigation items or menu links—the true operational takeaway is **chunking** and eliminating *extraneous cognitive load* (visual noise that consumes mental capacity without helping the user understand the task).
* **AI Design Rules:**
  * Organize dense content into smaller, scannable, semantically related chunks (e.g., grouping card details, formatting phone numbers as `555-019-2834` instead of `5550192834`, separating dashboard sections clearly).
  * Reinforce chunking with **Gestalt Grouping Principles**:
    * *Law of Proximity:* Place related elements close together; separate unrelated elements with generous whitespace.
    * *Law of Common Region:* Use subtle borders, cards, or background fills to bind related items into one conceptual group.
    * *Law of Similarity:* Give functionally related elements consistent visual treatment so users recognize patterns instantaneously.

#### 5. Fitts's Law (Target Size & Distance)
> **Principle:** *The time to acquire a target is a function of the distance to and size of the target.*

* **Why It Matters:** Small, cramped, or poorly placed controls cause mis-clicks, slow interaction, and motor frustration—especially on mobile touchscreens or for users with motor impairments.
* **AI Design Rules:**
  * Make interactive targets large enough to select effortlessly (minimum touch target of $\ge 44\text{px} \times 44\text{px}$ on mobile/touch interfaces, with clear hit areas on desktop).
  * Provide ample spacing between adjacent interactive elements to prevent accidental taps (especially near destructive actions like *Delete*).
  * Place primary actions in high-accessibility zones (near the user's current point of focus or within natural thumb reach on mobile), and push destructive actions slightly farther away or behind deliberate confirmation.

#### 6. Tesler's Law (The Law of Conservation of Complexity)
> **Principle:** *For any system, there is a certain amount of inherent complexity that cannot be reduced—it can only be shifted between the user and the product/engineering team.*

* **Why It Matters:** AI tools often default to offloading complexity onto the user—generating cluttered settings panels, raw configuration forms, and unnecessary toggles.
* **AI Design Rules:**
  * **Absorb complexity in code and design:** Use smart defaults, auto-detection (e.g., auto-filling city/state from postal code, inferring credit card type from the first digits), inline validation, and contextual automation so users do less work.
  * **Guardrail:** Never oversimplify to the point of hiding essential control or making the interface mysteriously abstract for power users.

### Cluster C: Visual Hierarchy & Perceived Usability

#### 7. Von Restorff Effect (The Isolation Effect)
> **Principle:** *When multiple similar objects are present, the one that differs from the rest is most likely to be noticed and remembered.*

* **Why It Matters:** Visual hierarchy only works through restraint. If everything shouts, nothing is heard.
* **AI Design Rules:**
  * Make the single most important element or primary CTA unmistakably distinct via size, contrast, weight, or position.
  * Limit visual emphasis strictly—avoid competing bright buttons, excessive badges, or cluttered alert banners that cause banner blindness.
  * **Accessibility Guardrail:** Never rely exclusively on color to communicate distinction or state (excludes users with color vision deficiency), and respect `prefers-reduced-motion` when using animation for emphasis.

#### 8. Aesthetic-Usability Effect
> **Principle:** *Users often perceive aesthetically pleasing design as more usable—and are more tolerant of minor usability issues when an interface looks refined.*

* **Why It Matters:** Strong visual craft genuinely creates positive emotional affect, builds trust, and supports tolerance for minor friction.
* **CRITICAL AI WARNING (The Microwave Burrito Trap):** Visually pleasing UI **masks real usability defects** during reviews and user testing. When AI generates sleek shadows, clean typography, and smooth gradients in seconds, teams are psychologically primed to miss broken user flows, confusing information architecture, and missing edge cases. Always audit underlying usability separately from visual polish.

### Cluster D: Speed, Flow, & Emotional Memory

#### 9. Doherty Threshold ($< 400\text{ms}$ Responsiveness)
> **Principle:** *Productivity and flow soar when a computer and its users interact at a pace ($< 400\text{ms}$) that ensures neither has to wait on the other.*

* **Why It Matters:** Delays longer than $400\text{ms}$ break cognitive flow and make software feel sluggish and untrustworthy.
* **AI Design Rules:**
  * Provide immediate visual feedback ($< 100\text{ms}$–$400\text{ms}$) for every user action—even if the underlying network operation takes longer.
  * Use **perceived performance** techniques when true latency exceeds $400\text{ms}$: optimistic UI updates, skeleton screens, smooth state transitions, and progress indicators (which make wait times tolerable regardless of exact duration).
  * **Strategic Nuance:** For high-stakes, complex operations (e.g., security verification, financial calculation, searching quotes), a brief, transparent animated progress step can *increase* perceived thoroughness and trust compared to an instantaneous flash.

#### 10. Peak-End Rule
> **Principle:** *People judge an experience largely based on how they felt at its most intense point (the peak) and at its end—rather than the sum or average of every moment.*

* **Why It Matters:** Negative peaks leave a disproportionately stronger memory than positive ones, and clumsy endings sour an otherwise strong product.
* **AI Design Rules:**
  * **Engineer Positive Peaks & Memorable Endings:** Invest disproportionate craft ("Pepsi bubbling") into high-emotion moments: first-run "aha" moments, task completions, payment/submission confirmations, and celebratory states.
  * **Eliminate Negative Peaks:** Obsess over failure states, empty states, form errors, checkout friction, and slow loading moments—turn moments of anxiety into calm, helpful guidance (e.g., clear recovery actions instead of dead-end error pages).

## 4. Pillar 3: Ethical UX — With Power Comes Responsibility

Jon Yablonski emphasizes that applying psychology to interfaces is a form of power—and **ethics must be built into the design process from day one, never bolted on afterward.**

### Strict Anti-Dark-Pattern Directives for the AI

AI must **never** suggest, generate, or rationalize manipulative behavioral patterns designed to hijack human psychology at the user's expense:

* **No Intermittent Variable Rewards / Infinite Loops:** Do not manufacture compulsive pull-to-refresh or endless-scroll traps where bounded, intentional browsing serves the user better.
* **No Deceptive Defaults or Hidden Friction:** Never pre-check opt-ins for marketing/add-ons, hide unsubscribe/cancellation flows (the "roach motel" pattern), or make leaving harder than joining.
* **No Manufactured Scarcity or Confirmshaming:** Never use fake countdown timers, fabricated low-stock warnings, or guilt-inducing opt-out copy (e.g., *"No thanks, I prefer losing money"*).
* **No Exploitative Social Affirmation or Forced Reciprocity:** Never coerce users into sharing contacts or spamming peers to unlock basic functionality.

### Four Ethical Practices to Follow

1. **Slow Down and Be Intentional:** Pause to ask *"What unintended consequences could this pattern create at scale?"*
2. **Think Beyond the Happy Path:** Actively design for stressed, distracted, first-time, low-bandwidth, and assistive-technology users.
3. **Prioritize Accessibility as a Baseline:** Semantic structure, keyboard navigation, color contrast, screen-reader clarity, and reduced-motion support are non-negotiable.
4. **Look Beyond Raw Engagement Metrics:** Optimize for genuine user outcomes, empowerment, and well-being—not time-on-screen vanity metrics.

## 5. Pillar 4: Encode Standards Into the System (Scale Intent, Not Just Consistency)

> **Core Shift:** *The object of design is no longer the individual screen. It is the system itself.*

Humans will not be present for every UI decision going forward—distributed teams, background agents, and generative UI will assemble interfaces autonomously. Previously, design systems did not have to document everything because a designer was always in the room to fill in the blanks. Today, standards must be encoded directly into the means of production.

### The Gutenberg Principle

Johannes Gutenberg did not just invent a printing press with 26 lowercase and 26 uppercase letters. He engineered **290 unique characters**—including variable widths, abbreviations, and ligatures—so that fully justified machine-set text would not develop ugly "rivers and lakes of whitespace."

* **Design System Goal:** Make the system **both extensible and opinionated enough that machine-made output feels as good as handmade**.

### Old Design Systems vs. AI-Era Design Systems

| Dimension | Legacy Design Systems | Modern AI-Era Design Systems |
| :--- | :--- | :--- |
| **Primary Goal** | Scale **consistency** across human designers. | Scale **intent and cognitive usability** across humans and AI agents. |
| **Scope** | Isolated atomic parts and components (buttons, inputs, tokens). | **Full templates, compositions, end-to-end behavioral flows, and UX law guardrails** so the system knows how the product behaves as a whole. |
| **Delivery Mechanism** | Passive wiki/docs or loose doc lookups (which cause context rot and inconsistent results—e.g., 3 identical prompts yielding 3 wildly different UIs). | Opinionated harnesses, structured templates, and just-in-time constraints delivered directly where building happens (e.g., a design-system CLI or repo rules) so AI output is deterministic and obedient. |

### The Ceiling of Systems (Christopher Alexander's Warning)

> *"A system can satisfy every rule and still be dead."*

Following design tokens, spacing grids, component rules, and UX checklists is strictly the **baseline**, never the finish line. A rule-compliant interface can still be soulless Zombie UI if it lacks holistic editing and artistry.

## 6. Pillar 5: Refuse to Confuse "Done" With "Good" (Post-Build Editing)

### The Structural Shift in Quality Filtering

Historically, scarcity acted as a built-in quality filter: teams had 20 ideas, could only staff 1, and pruned methodically before and during the build. Today, AI lets a team build 20 prototypes in a week. While reacting to real prototypes beats endless theoretical meetings, **filtering has shifted to post-build—when it is psychologically much harder to say no.**

**Mental Models to Unlearn:**

* **Built** $\neq$ **Done.**
* **Done** $\neq$ **Good.**
* Editing is not merely binary ("ship vs. kill"); it asks: *"Is this even fully formed? How do we push this to true completion?"*

### The Experiential Editing Protocol

When reviewing or refining a design, do not judge components in isolation. **Experience the product end-to-end as a real user would** and interrogate it with four questions:

1. **Problem Fit:** Does this actually solve the user's core problem?
2. **Mental Model Alignment:** Is it attuned to how the user actually thinks about their task (Jakob's Law)?
3. **Journey Coherence:** Many elements look good in isolation but feel jarring or disconnected when stitched into the full user journey. Does this feel like a unified whole?
4. **Differentiation:** Does this genuinely stand apart, or is it interchangeable with any competitor?

### Defeating "AI Slop" (Nabeel Qureshi's Framework for Great Art)

Great work relies on three qualities that AI naturally struggles to produce on its own—meaning you must deliberately supply and verify them:

1. **Unexpected Details:** Thoughtful touches that trigger *"Wow, I can't believe they thought of that."*
2. **Deeper Meaning Behind the Surface:** Choices rooted in purpose rather than decorative filler.
3. **Continuous Themes:** Visual, verbal, and interactive threads that tie disparate screens into one cohesive world.

**The "Green Cup" Test (Accountability for Every Pixel):**

> *"One of the things that so offends us about AI slop is the sense that the details don't matter. The cup is green, but may as well have been blue."*
> Every color, radius, layout, label, spacing token, and motion curve must exist for an intentional reason. Take accountability for every decision—which in interface design means every pixel.

### The 56-Iteration Standard

Use AI to expand the **possibility space**, not to settle on the first plausible draft.

* *Benchmark:* For an event opening animation, Stripe's design team paired a 3D scene with AI animation tools. Version 1 looked "cool," but pixel-by-pixel scrutiny revealed jilted motion and awkward framing. It took **56 iterations** to achieve natural realism, life, and perceptible care. AI made exploring that complexity possible—human scrutiny made it great.

## 7. Pillar 6: Unleash Creativity & Artistry

> *"Yes, AI can help us manufacture monotony, but it is also the greatest creative catalyst we've ever had."*

When anyone can build software quickly, **differentiation becomes simultaneously harder and more valuable.**

### Invent New Interfaces, Don't Just Clone Old Ones

Chats, generic charts, standard SaaS tables, and CLIs are **not** the pinnacle of modern interaction. Just as **multi-touch** unlocked completely new interaction paradigms and the **synthesizer** unlocked entirely new sounds, AI enables software that is **generative, alive, responsive, and dynamic**. While honoring Jakob's Law for core mental models, actively look for ways to invent better, context-native interaction models rather than defaulting to tired templates.

### Amplify Human Craft With AI Precision

Combine human creative judgment and tactile/original artistry with AI's ability to explore and refine details (e.g., Stripe's *Built to Grow* cover started with physical marbling by a human artist, then used AI to fine-tune line and color placement to exact visual standards).

### Two Tactical Rules for Making AI a Better Creative Partner

1. **Radically Improve Inputs:**
   * Never accept or act on thin prompts (e.g., *"Make a website for a Korean BBQ restaurant"*).
   * Inject explicit beliefs, brand personality, definitions of quality, target emotional tone, user cognitive constraints, and curated reference material so the model is forced off its probabilistic average and pushed to think differently.
2. **Aggressively Stress Outputs:**
   * Actively resist the Microwave Burrito Dilemma—always push at least one step further.
   * Run **adversarial critique passes** (or spin up an adversarial critique persona) to "bang up" the design, attack lazy assumptions, highlight generic patterns, expose UX friction, and demand stronger alternatives.

### Cultural Principle: "Protect the Strange"

Cookie-cutter patterns feel safe and cozy, but they vanish into the noise. Spend the time and cost savings unlocked by AI on experimentation, originality, and making something truly special.

### The Ultimate North Star: Gothic Craft Over Modernist Clones

In 1850, art critic **John Ruskin** praised **Gothic architecture** as the antithesis of soulless uniformity: no two Gothic buildings were alike—in fact, not even two columns were identical. Every detail carried the visible hand, mind, and care of its maker.

Users are not impressed that an interface was generated in 30 minutes with AI or flashy tech stacks. They are impressed by **problems deeply solved, needs quietly anticipated, cognitive friction removed, and clever details that prove someone cared.**

## 8. Operational Playbook for AI Agents (Use on Every Project)

When assisting with a project that suffers from design or UX issues—or when building new UI—execute these four phases in order.

### Phase 1: Project POV & UX Context Lock (Fill Out Before Designing)

*If these are missing from the project context, ask the user before generating UI:*

* **Product & Domain Context:** `[What is this really? What real-world feeling/environment should it evoke—not "generic SaaS"?]`
* **Brand Point of View & Core Values:** `[2–3 strong, opinionated values—e.g., Optimism, Warmth, Surgical Precision—and how they appear in color, typography, copy, and motion]`
* **Primary User Mental Model & Jobs-to-Be-Done:** `[What familiar tools/workflows does the user already know? What is their primary goal on each screen?]`
* **Key Emotional Peaks & Endings:** `[Which 2–3 moments carry the highest anxiety or delight—e.g., onboarding, errors, submission, completion?]`
* **Reference Material / Taste Anchors:** `[Specific non-generic inspirations from art, architecture, print, or exemplary products]`
* **Anti-Patterns to Avoid:** `[Explicitly list what this product must NEVER look, feel, or behave like]`

### Phase 2: System-Level & Cognitively Sound Architecture

* Define reusable **flows and page templates**, not just disconnected buttons or cards.
* Encode opinionated rules for hierarchy, chunking, spacing, typography, touch targets, states (loading, empty, error, edge cases), and microcopy directly into project rules/components so outputs remain coherent across sessions.
* Absorb inherent complexity in software via smart defaults and progressive disclosure (*Tesler's Law* + *Hick's Law*) and make all user inputs forgiving (*Postel's Law*).
* Keep design documentation concise, concrete, and colocated with code to prevent context rot.

### Phase 3: Post-Build Adversarial Audit (Dual Detector)

Before declaring *any* design or frontend task complete, run **both** parts of this adversarial audit:

#### Part A: Anti-Zombie UI & Craft Audit (Katie Dill)
* [ ] **The "Korean BBQ" Context Test:** If you stripped the logo and copy, could someone immediately tell what domain and brand this belongs to—or does it look like a generic SaaS template?
* [ ] **The "Microwave Burrito" / Aesthetic-Usability Check:** Is surface polish (shadows, gradients, rounded corners, clean CSS) masking a weak UX, unnecessary steps, or an unsolved user problem?
* [ ] **The "Green Cup" Test:** Pick 5 visual or interaction choices at random (a color, layout split, icon, transition, button label). Can you justify *why* each is what it is instead of something else? If not, it is AI slop—fix it.
* [ ] **The End-to-End Coherence Check:** Walk through the full user journey from entry to completion (including error and empty states). Does every step connect seamlessly?
* [ ] **The "One Level Deeper" (Pepsi Bubbling) Pass:** Identify at least 5 subtle craft refinements (optical alignment, typography hierarchy, edge-case handling, anticipatory defaults, micro-interactions, sharper copy) that go one level deeper than requested.
* [ ] **The "Soul & Anticipation" Check:** Does this screen contain at least one thoughtful, context-aware detail that anticipates the user's next need or friction point?

#### Part B: Cognitive UX & Ethics Audit (Jon Yablonski)
* [ ] **Jakob's Law Check:** Are core navigation, controls, and layouts aligned with established user mental models, reserving novelty for brand craft and domain-specific value?
* [ ] **Hick's Law Check:** Are choices minimized at decision-critical moments? Are complex tasks broken into progressive steps with clear recommended options?
* [ ] **Miller's Law & Gestalt Chunking Check:** Is dense content chunked into scannable groups using clear proximity, common regions, and visual similarity, with zero extraneous cognitive load?
* [ ] **Fitts's Law Check:** Are primary targets generously sized ($\ge 44\text{px} \times 44\text{px}$ on touch), well-spaced, and placed near natural focus/thumb zones—with destructive actions safely separated?
* [ ] **Tesler's Law Check:** Has the product absorbed all avoidable complexity through smart defaults, auto-formatting, and sensible automation instead of dumping settings/forms on the user?
* [ ] **Postel's Law Check:** Are inputs forgiving of messy human behavior (formatting, typos, varied devices), while outputs and error messages are concise, clear, and actionable?
* [ ] **Von Restorff & Accessibility Check:** Does only *one* primary CTA/element command visual isolation per view? Is contrast accessible without relying solely on color or jarring motion?
* [ ] **Doherty Threshold Check:** Does every interaction respond in $< 400\text{ms}$ (or use optimistic UI, skeletons, and clear progress indicators to preserve flow)?
* [ ] **Peak-End Rule Check:** Are high-emotion moments, error states, empty states, and completion screens designed with exceptional care to prevent negative peaks and leave a memorable finish?
* [ ] **Ethical UX Check:** Is the interface completely free of dark patterns (deceptive defaults, hidden friction, fake urgency, confirmshaming, infinite traps)?

### Phase 4: Iterate Past Draft 1

* Never treat v1 as final. Present structural and cognitive UX critique alongside drafts, propose bold/non-obvious alternatives that break out of cookie-cutter patterns without breaking mental models, and iterate relentlessly until the product shows unmistakable care, usability, and intent.