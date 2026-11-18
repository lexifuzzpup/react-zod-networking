# react-zod-fetch
A web request framework using Zod types, with React integration.

## Example:
```tsx
import z from "zod";
import { NetworkResource, useNetworkJsonResource } from "react-zod-fetch";

const User = z.object({
    username: z.string(),
    email: z.string()
})

export function UserCard({ authorization }: { authorization: string | undefined }) {
    const user = useNetworkJsonResource({
        url: "/api/user/me",
        schema: User,
        authorization
    });

    return (
        <div>
            { user.loading && <p>Loading...</p> }
            { user.result && <>
                <p>Username: { user.result.username }</p>
                <p>Email: { user.result.email }</p>
                <button onClick={async () => {
                    await NetworkResource.patch("/api/user/me", {
                        data: { username: prompt("Enter new username:") },
                        authorization
                    });
                    user.reload();
                }}>Change Username</button>
            </> }
            { user.error && <>
                <p>Error while loading user</p>
                <p>{ user.error.message }</p>
            </> }
        </div>
    )
}
```

To install dependencies:

```bash
bun install
```

To test:

```bash
bun test
```