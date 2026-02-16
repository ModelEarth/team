<h1 class="card-title">How to deploy changes</h1>

Update and make commits often. (At least hourly if you are editing code.)
Append "nopr" if you are not yet ready to send a Pull Request.


## Using your Code CLI to push and pull

For the first usage, include extra guidance. 
Your push will also pull recent updates from others on Github.

	push using webroot/AGENTS.md with git.sh  


If you find "push" is asking for multiple approvals, your CLI isn't following its AGENTS.md instructions.
When AGENTS.md is followed, "push" uses the git.sh file to first pull, then update the webroot, submodules and forks.

	push

Additional deployment commands:

	push [folder name]  # Deploy a specific submodule or fork
	push submodules  # Deploy changes in all submodules
	push forks  # Deploy the extra forks added

"push" also sends a Pull Request (PR) unless you include "nopr"