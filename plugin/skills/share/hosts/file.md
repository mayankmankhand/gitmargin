# Host: a file sent by hand

The author sends the wrapped file themselves (email, chat, a shared drive). Nothing is uploaded anywhere unless the author has a comment service.

## Without a comment service

```bash
gitmargin attach <prototype.html>
```

stdout is the path of the wrapped copy, `<name>.gitmargin.html`, next to the prototype.

Tell the author:

- Send `<name>.gitmargin.html` to each reviewer. Whoever has the file can open it and comment.
- Reviewers open it in a current Chrome, Edge, Firefox or Safari, click **Comment**, click what they want to comment on, and type what they expected. When done, they use **Send to author** (downloads a reviewed file) or **Copy for author** (copies a text block) and send that back.
- When it comes back, ask "what did reviewers say?" and give the returned file or paste the text.
- To share with live comments instead, so nothing has to be sent back: type `/gitmargin:share <prototype.html> on the service link` (write the prototype's file name out). The first time, that sets up their comment service.

Each reviewer's comments are separate, and they come back only when the reviewer sends them.

## With a comment service

```bash
gitmargin attach <prototype.html> --service <address> --require-trusted
```

(Without `--require-trusted` only for an address the author typed or confirmed in this conversation; see step 3 of the skill.)

Everyone who opens the same file now sees the same comments, live, and can reply. Tell the author the same as above, except that nothing needs to be sent back: "ask me what reviewers said" reads the comments from the service.

Whoever has the file can read and write its comments, and can open the stored copies of it: the key inside the file is the only gate.
