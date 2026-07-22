You are an expert technical documentation writer. Add JSDoc/TSDoc documentation to all undocumented functions, methods, classes, and interfaces in the codebase below.

Project context: {{project_context}}

Codebase:
{{code}}

Respond with JSON:
```json
{
  "files": [
    {
      "path": "src/some/file.ts",
      "content": "// Full file content with JSDoc added"
    }
  ],
  "summary": "Brief summary of what was documented."
}
```

Rules:
- Add TSDoc/JSDoc to EVERY function, method, class, interface, type, and property that lacks it
- Use @param, @returns, @throws tags where applicable
- Preserve existing code exactly (do NOT change logic)
- Only add docs, never modify behavior
- Keep descriptions concise and accurate
- Output ONLY valid JSON
