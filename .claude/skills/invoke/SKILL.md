---
name: invoke
description: This skill should be used when the user asks to "run an invoke task", "run inv", "add a task", "update a task", "list invoke tasks", or references any dev task by its invoke name (e.g. "dev.bundle", "dev.install", "dev.lint", "dev.format", "dev.test", "dev.release"). Manages and runs invoke tasks defined in tasks.py.
argument-hint: <task-name> | list | edit
allowed-tools: [Bash, Read, Edit]
version: 0.1.0
---

# Invoke Tasks

Invoke tasks live in `tasks.py` at the project root and use the `invocate` library (a Python-enabled Makefile alternative).

## Running Tasks

Always activate the virtualenv first. Use `invocate` directly (the user has `inv` as a shell alias for it, but that alias is not available here):

```bash
source ~/.virtualenvs/interstitia/bin/activate && invocate <task>
```

To list available tasks:

```bash
source ~/.virtualenvs/interstitia/bin/activate && invocate -l
```

## Available Tasks

| Task | Description |
|------|-------------|
| `dev.bundle` | Concatenate source JS modules into `contents/code/main.js` |
| `dev.clean-repo` | Remove generated `main.js` |
| `dev.install` | Bundle then install to KDE plugin directory |
| `dev.release` | Bundle then package for distribution |
| `dev.install-tools` | Install npm dev tools (Prettier, ESLint, Jest) |
| `dev.lint` | Run ESLint on source files (cleans repo first) |
| `dev.format` | Run Prettier on source files |
| `dev.test` | Run Jest tests |
| `dev.show-logs` | Tail KWin logs filtered to interstitia |

## Adding or Updating Tasks

Tasks are defined in `tasks.py`. Each task uses the `@task` decorator:

```python
from invocate import task

@task(namespace='dev', name='my-task')
def my_task(c):
    """Description shown in invocate -l"""
    c.run('some command')
```

Key decorator options:
- `namespace` + `name` — determines the CLI invocation as `namespace.name`
- `pre=[other_task]` — tasks to run before this one
- `pty=True` — attach a pseudo-terminal (needed for interactive/streaming output like `show-logs`)

When adding a task, read `tasks.py` first to understand existing patterns, then insert the new task in a logical location.