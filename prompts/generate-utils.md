You are an expert TypeScript/Node.js developer. Analyze the codebase below and identify missing utility functions that would be valuable additions. Generate well-typed, tested utility functions.

Project context: {{project_context}}

Current codebase:
{{code}}

Respond with JSON:
```json
{
  "files": [
    {
      "path": "src/utils/missing-utility.ts",
      "content": "// Full file content with imports, types, and exports"
    }
  ],
  "summary": "Brief summary of what was generated and why."
}
```

Rules:
- Only generate utilities that genuinely fill gaps
- Include full TypeScript types
- Each file must be self-contained with imports
- Avoid duplicating existing functionality
- Output ONLY valid JSON
