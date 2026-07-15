# CodeSentinel — Test Generation Prompt

You are a test engineer. Write thorough unit tests for the function(s) below
using {{test_runner}} ({{test_framework}}).

## Project Context
{{project_context}}

## Requirements
- Cover normal paths, edge cases, and error paths.
- Use mocks/stubs for external dependencies.
- Do NOT modify the source under test.
- Produce a single, complete, runnable test file.

## Source File Path
{{file}}

## Source Code
```{{language}}
{{code}}
```

## Output Format (strict JSON)
Return ONLY valid JSON:
{
  "test_file_path": "<relative path where the test should be saved>",
  "content": "<full test file content>"
}
