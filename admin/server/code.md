### 🛡️ Run Claude Code CLI

Inside the claude cmd window, start your local Python HTTP server by typing:

	start server

Or manually run the command from team/CLAUDE.md:

	nohup ./desktop/install/quickstart.sh --cli > /dev/null 2>&1 &

The above starts the Python HTTP server with server-side execution access in a virtual environment.
It keeps the server running in the background and is invoked with the --cli flag to skip the Enter keystroke.

**Note:** All "start server" commands are defined in [team/CLAUDE.md](../../CLAUDE.md#start-http-server). When updating server start instructions, always update team/CLAUDE.md first.

### Alternative: Simple HTTP Server

For basic static file serving without server-side execution, type:

	start http

Or manually run:

	python -m http.server 8887

This provides a simpler HTTP server that serves static files only. Use "start server" (above) if you need server-side Python execution.

<!--
Previous Rust API server command (commented out):
	nohup cargo run -- serve > server.log 2>&1 &

The above keeps the server running and also stores logs,
whereas `cargo run -- serve` doesn't remain running inside the CLI.
-->

View the website locally at: [localhost:8887/team](http://localhost:8887/team/)

If this is your first time using rust, your CLI will provide an install command. Run that outside of your CLI.

If you get a permissions errror, use the fix documented on the main webroot setup page under: 
Do you have Github CLI installed? No > Resolving Github CLI Install Error

<!--
  # Check if server is running
  curl http://localhost:8081/api/health

  # Stop the background server
  lsof -ti:8081 | xargs kill -9

  # View server logs
  tail -f server.log
-->