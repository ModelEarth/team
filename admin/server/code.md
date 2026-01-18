### 🛡️ Run Claude Code CLI

Inside the claude cmd window, start your local Python HTTP server by running:
(Maybe you can simply type "Start server")

	../../../desktop/install/quickstart.sh --cli

The above starts the Python HTTP server with server-side execution access in a virtual environment.
It keeps the server running and is invoked with the --cli flag to skip the Enter keystroke.

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