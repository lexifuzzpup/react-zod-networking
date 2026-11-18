import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Gives tests a DOM, plus a `document.location.origin` that relative URLs resolve against.
GlobalRegistrator.register({ url: "http://localhost:3000" });
