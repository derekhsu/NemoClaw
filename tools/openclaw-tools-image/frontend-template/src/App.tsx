import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function App() {
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");
  return (
    <main className="mx-auto max-w-md p-8">
      <Card>
        <CardHeader>
          <CardTitle>OpenClaw tools template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input id="name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button id="greet" onClick={() => setGreeting(`Hello, ${name}`)}>
            Greet
          </Button>
          <p id="greeting">{greeting}</p>
        </CardContent>
      </Card>
    </main>
  );
}
