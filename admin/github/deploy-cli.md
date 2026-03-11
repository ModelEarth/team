<h1 class="card-title">How to deploy changes</h1>

Update and make commits often. (At least hourly if you are editing code.)
Append "nopr" if you are not yet ready to send a Pull Request.


## Using your AI Coding Agent to push and pull

The push will pull first. For the first usage, include extra guidance.

"push" also sends a Pull Request (PR) unless you include "nopr"

<pre><code>push using webroot/AGENTS.md guidance with git.sh</code></pre>

Then you just "push" going forward to deploy changes.

	push

If you find "push" is asking for multiple approvals, your CLI isn't following the AGENTS.md instructions.
"push" updates the webroot, submodules and forks. Additional repos can be updated using Github Desktop.

Additional deployment commands:

	push [folder name]  # Deploy a specific submodule or fork
	push submodules  # Deploy changes in all submodules
	push forks  # Deploy the extra forks added
