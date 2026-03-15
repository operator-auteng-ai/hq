# SOFTWARE PHILOSOPHY

Core engineering principles that govern how we build software in AutEng HQ and every project it manages.

---

## DRY — Don't Repeat Yourself

Every piece of knowledge must have a single, unambiguous, authoritative representation within a system. Duplication is where bugs breed — when logic exists in two places, one inevitably drifts out of sync with the other. Extract shared logic into functions, modules, or shared packages. If you're copying and pasting, you're creating a future bug.

**Applies to**: code, configuration, schema definitions, documentation. If two docs say the same thing, one of them is wrong (or will be soon).

## Composition Over Inheritance

Build behaviour by assembling small, focused pieces rather than extending deep class hierarchies. Inheritance creates tight coupling and fragile base class problems. Composition creates flexibility — you can swap, wrap, and recombine components without rewriting the tree above them.

In practice: prefer functions, interfaces, and dependency injection over `extends`. Use mixins or higher-order functions when you need shared behaviour. Classes are fine for wrapping stateful resources, but don't build taxonomies with them.

## Model the Real World

Your data model should reflect the domain, not the UI or the framework. If you can't explain your ERD to a non-engineer using real-world language, the model is wrong. Entities should map to things that exist in the problem space. Relationships should map to how those things actually relate.

Watch for: invented entities that only exist to serve a UI layout, missing entities that the domain clearly has, and relationships that don't match how the business actually works.

## Fail Fast

When an error occurs, surface it immediately. Don't swallow exceptions, don't return default values that mask failures, don't silently continue in an unknown state. Throw the error up to the caller and let the boundary above handle it — because by definition, an error means the current context doesn't know what state it's in.

**The principle**: the thing that detects the error is rarely the thing that should decide how to handle it. Let errors propagate to the appropriate boundary (API route, process supervisor, UI error boundary) where there's enough context to respond correctly.

**In practice**:
- Validate inputs at the boundary, fail before doing work
- Don't catch exceptions unless you have a specific recovery strategy
- Log at the boundary, not at every intermediate layer
- Use typed errors so callers can make informed decisions
- Never `catch (e) {}` — silent swallowing is the worst kind of bug

## SOLID Principles

Apply where they reduce complexity; don't apply them dogmatically.

- **Single Responsibility**: A module should have one reason to change. If a function does parsing AND validation AND persistence, split it. But don't split a 10-line function into three files for purity's sake.

- **Open/Closed**: Design for extension without modification. Use interfaces, callbacks, and configuration over hardcoded branching. When you add a new deploy target, you shouldn't need to edit the deploy manager — you should register a new provider.

- **Liskov Substitution**: If you substitute one implementation for another (e.g., swap SQLite for PostgreSQL behind the same interface), nothing should break. Design interfaces around behaviour, not implementation details.

- **Interface Segregation**: Don't force consumers to depend on methods they don't use. Prefer small, focused interfaces over god-objects. An agent doesn't need the full process manager — it needs `getOutput()` and `getStatus()`.

- **Dependency Inversion**: High-level modules shouldn't depend on low-level modules. Both should depend on abstractions. The orchestrator depends on an `AgentManager` interface, not on the Claude SDK directly. This makes testing possible and swapping implementations straightforward.

## Additional Principles

### YAGNI — You Aren't Gonna Need It

Don't build abstractions for hypothetical future requirements. Build for what you need now, with clean interfaces that make future extension easy. The best code to maintain is code that doesn't exist.

### Explicit Over Implicit

Prefer explicit configuration over convention-based magic. Explicit code is readable, debuggable, and grep-able. If someone has to know a secret convention to understand your code, you've created a knowledge silo.

### Minimise Blast Radius

Scope changes tightly. A bug in the deploy manager should not take down the agent monitor. Isolate failure domains. Use boundaries (processes, error boundaries, transactions) to contain damage.

### Optimise for Reading

Code is read 10x more than it is written. Choose clarity over cleverness. A straightforward `if/else` is better than a one-liner that requires a comment to explain. Name things precisely — a good name eliminates the need for a comment.
