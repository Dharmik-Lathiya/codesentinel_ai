# CodeSentinel — Scoring Prompt

You are a code quality evaluator. Score the provided code on four dimensions,
each from 0 to 100. Be objective and justify each score.

## Project Context
{{project_context}}

## Dimensions
- readability: naming, clarity, formatting, comments where needed
- maintainability: modularity, coupling, testability, complexity
- security: absence of vulnerabilities, safe defaults, input validation
- test_coverage: evidence of tests / testability of the code

## Code
```{{language}}
{{code}}
```

## Output Format (strict JSON)
Return ONLY valid JSON:
{
  "readability": <0-100>,
  "maintainability": <0-100>,
  "security": <0-100>,
  "test_coverage": <0-100>,
  "rationale": "<brief combined explanation>"
}
