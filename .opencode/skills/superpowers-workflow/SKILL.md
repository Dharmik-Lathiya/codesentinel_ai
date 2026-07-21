---
name: superpowers-workflow
description: Complete development workflow using Superpowers skills for the codesentinel_ai project — from brainstorming through shipping
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: sdlc
---

## Complete Superpowers Workflow for CodeSentinel AI

Follow these steps in order when working on a feature or fix:

### 1. Brainstorming
Load the brainstorming skill to refine rough ideas through questions, explore alternatives, and validate design before writing code:
```
use skill: brainstorming
```

### 2. Writing Plans
After design approval, break work into bite-sized tasks (2-5 minutes each) with exact file paths, complete code, and verification steps:
```
use skill: writing-plans
```

### 3. Test-Driven Development
During implementation, enforce RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass:
```
use skill: test-driven-development
```

### 4. Execute the Plan
Run the plan with review checkpoints between tasks:
```
use skill: executing-plans
```
Or for complex work, use subagent-driven-development with fresh subagents per task:
```
use skill: subagent-driven-development
```

### 5. Code Review
Before submitting, review against the plan — report issues by severity:
```
use skill: requesting-code-review
```

### 6. Finish the Branch
When tasks are complete, verify tests and present merge/PR options:
```
use skill: finishing-a-development-branch
```

### Debugging
When something isn't working:
```
use skill: systematic-debugging
```
Then verify the fix actually resolved the issue:
```
use skill: verification-before-completion
```

### Git Workflows
For parallel development:
```
use skill: using-git-worktrees
```
