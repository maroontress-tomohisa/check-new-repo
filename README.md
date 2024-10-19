# Check New Repository with GitHub WebHook

This is a web server that receives GitHub webhook payloads. When a repository
creation is notified, it records the repository ID from the payload. Five
minutes after creation, it checks whether a team has been associated with the
repository. If no team association is found, it posts an issue to that
repository, mentioning the creator.

## Requirements

- Node.js 20

## How to build

```bash
sh make-resources.sh
npm install
```

## How to start the server

```bash
# The permissions required for PAT are explained in the following section
export GITHUB_TOKEN="..."
npm start -- your_organization
```

The default port is 3000. The default delay is 300 seconds. For more detailed
usage:

```bash
npm start -- --help
```

## Requirements for PAT

Your fine-grained personal access tokens (PAT) requires as follows:

- Resource owner
  - _Your Organization_
- Repository access
  - **All repositories**
- Permissions &rightarrow; Repository permissions
  - "Administration" repository permissions (Read-only)
    - `GET /repos/{owner}/{repo}/teams`
  - "Issues" repository permissions (Read and write)
    - `POST /repos/{owner}/{repo}/issues`
  - "Metadata" repository permissions (Read-only)
    - `GET /repositories/{repo_id}`

## Requirements for WebHook

- Payload URL
  - _Your URL_
- Content type
  - application/json
- Which events would you like to trigger this webhook?
  - Let me select individual events
  - [x] Repositories
- [x] Active
