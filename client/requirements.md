## Packages
date-fns | For formatting timestamps nicely (e.g., "Just now", "Yesterday")
clsx | For conditional class names (usually part of tailwind-merge util, but good to ensure)

## Notes
- Using DM Sans for a modern, clean typeface.
- Dashboard layout splits into Sidebar (conversations) and Main (chat).
- Polling interval set to 8000ms (8 seconds) for conversations and active chat as requested.
- Auth check happens on app load; redirects to /login if 401.
