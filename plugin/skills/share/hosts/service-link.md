# Host: the service link

The author's comment service keeps a copy of each version of the page and serves it at one address. No other host is needed.

## Publish

```bash
gitmargin attach <prototype.html> --service <address> --require-trusted
```

(Without `--require-trusted` only for an address the author typed or confirmed in this conversation.)

The command's messages (stderr) end with the line to hand over:

```
Review link (always the newest version): <address>/p/<key>/latest
```

Give the author exactly that address. It always opens the newest version, so it stays the same when the author shares again. (The line above it, `A copy of this version is stored at .../v1-...`, is one version's address; never hand that one over.) If the messages say the page is too large to store (over 4 MB), there is no link: say so, and offer a file instead.

## Tell the author

- The review link, and: "Anyone who has this link can open the page and comment. The link is the only gate."
- Reviewers type their name each time they open the link (this locked-down page cannot remember them).
- The page opens locked down: it cannot use the browser's storage, so a prototype that saves progress in the browser must guard those calls (the check in step 1 catches it).

## Sharing again

Run the same command after the prototype changed. It makes a new version at the same link; its comments start empty, and older versions, with their comments, stay one click away from the Version line in the comments list.

## When it stops working

- `Refusing to use ... has not used that service before`: the address is not trusted on this machine. Ask the author (step 3 of the skill).
- A network error or `503`: the service is down or its database is not connected. `curl -s <address>/api/ping` shows which; see [../setup-service.md](../setup-service.md), "If the check fails".
