import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { unauthorized } from "./errors.js";

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function extractToken(req) {
  const header = req.headers.authorization ?? "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

// Hard gate: 401 when there is no valid token. Sets req.user = { id, email, role, sub }.
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next(unauthorized());
  try {
    const decoded = verifyToken(token);
    req.user = { ...decoded, id: decoded.sub };
    return next();
  } catch {
    return next(unauthorized());
  }
}

// Soft gate: attaches req.user when a valid token is present, otherwise anonymous.
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = verifyToken(token);
      req.user = { ...decoded, id: decoded.sub };
    } catch {
      // anonymous
    }
  }
  return next();
}

export function isAdmin(req) {
  return String(req.user?.role || "").toLowerCase() === "admin";
}

export function isModerator(req) {
  const role = String(req.user?.role || "").trim().toLowerCase();
  return role === "admin" || role === "moderator";
}
