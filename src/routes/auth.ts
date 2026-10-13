import { Router } from "express";
import * as authService from "../services/auth.service";
import { validate } from "../middleware/validate";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from "../validators/auth.validator";

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: student@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: MyPassword123
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already registered
 */
router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const user = await authService.register(req.body);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive access and refresh tokens
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: student@example.com
 *               password:
 *                 type: string
 *                 example: MyPassword123
 *     responses:
 *       200:
 *         description: Access token and refresh token
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login({
      ...req.body,
      deviceInfo: req.headers["user-agent"],
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate the refresh token and receive new tokens
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token and refresh token
 *       400:
 *         description: Validation error
 *       401:
 *         description: Refresh token invalid, expired or revoked
 */
router.post("/refresh", validate(refreshSchema), async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke a refresh token
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post("/logout", async (req, res, next) => {
  try {
    await authService.logout(req.body.refreshToken);
    res.json({ message: "Logged out" });
  } catch (error) {
    next(error);
  }
});

export default router;
