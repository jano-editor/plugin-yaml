# jano-plugin-yaml

YAML syntax highlighting and formatting plugin for [jano editor](https://janoeditor.dev).

## Features

- Syntax highlighting (keys, values, comments, strings, numbers, variables)
- Auto-indent after `key:` and list items
- Auto-format (F3): fix indentation for entire document (respects editor tabSize setting)
- Autocomplete: docker-compose keys, kubernetes keys, known values (e.g. `restart:` → `always`, `unless-stopped`)
- Validation: YAML syntax errors shown as diagnostics (F4)
- Toggle comment (Ctrl+/)

## Install

```bash
jano plugin install jano-plugin-yaml
```

## Supported Files

- `.yml`
- `.yaml`

## License

MIT
