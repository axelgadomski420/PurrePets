import { Compass, Search, Plus, MessageCircle, Gamepad2, User } from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", key: "discover", icon: Compass },
  { to: "/explore", key: "explore", icon: Search },
  { to: "/create", key: "add", icon: Plus, primary: true },
  { to: "/messages", key: "messages", icon: MessageCircle },
  { to: "/arcade", key: "arcade", icon: Gamepad2 },
  { to: "/profile", key: "profile", icon: User },
];
