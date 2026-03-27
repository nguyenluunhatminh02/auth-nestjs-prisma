import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/common/services/redis.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();

    prismaService = app.get<PrismaService>(PrismaService);
    redisService = app.get<RedisService>(RedisService);
    jwtService = app.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prismaService.refresh_tokens.deleteMany({});
    await prismaService.login_history.deleteMany({});
    await prismaService.users.deleteMany({});
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Password123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('john@example.com');
      expect(response.body.user.firstName).toBe('John');
      expect(response.body.user.lastName).toBe('Doe');
    });

    it('should throw error for duplicate email', async () => {
      const registerDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Password123!',
      };

      // Register first user
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerDto);

      // Try to register with same email
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerDto)
        .expect(409);

      expect(response.body.message).toContain('Email already in use');
    });

    it('should throw error for weak password', async () => {
      const registerDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'weak',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerDto)
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should throw error for invalid email', async () => {
      const registerDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        password: 'Password123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerDto)
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      await prismaService.users.create({
        data: {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          password: hashedPassword,
          email_verified: true,
          is_active: true,
        },
      });
    });

    it('should login successfully with valid credentials', async () => {
      const loginDto = {
        email: 'john@example.com',
        password: 'Password123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.mfaRequired).toBe(false);
    });

    it('should throw error for invalid credentials', async () => {
      const loginDto = {
        email: 'john@example.com',
        password: 'WrongPassword123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(401);

      expect(response.body.message).toContain('Invalid email or password');
    });

    it('should throw error for non-existent user', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'Password123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(401);

      expect(response.body.message).toContain('Invalid email or password');
    });
  });

  describe('POST /api/v1/auth/refresh-token', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Create a test user and get refresh token
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      const user = await prismaService.users.create({
        data: {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          password: hashedPassword,
          email_verified: true,
          is_active: true,
        },
      });

      // Create refresh token
      const rt = await prismaService.refresh_tokens.create({
        data: {
          token: 'valid-refresh-token',
          user_id: user.id,
          expires_at: new Date(Date.now() + 86400000),
        },
      });
      refreshToken = rt.token;
    });

    it('should refresh token successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh-token')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should throw error for invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh-token')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.message).toContain('Refresh token invalid or expired');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      // Create a test user and login
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      const user = await prismaService.users.create({
        data: {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          password: hashedPassword,
          email_verified: true,
          is_active: true,
        },
      });

      // Create tokens
      accessToken = jwtService.sign({ sub: user.id, email: user.email });
      const rt = await prismaService.refresh_tokens.create({
        data: {
          token: 'valid-refresh-token',
          user_id: user.id,
          expires_at: new Date(Date.now() + 86400000),
        },
      });
      refreshToken = rt.token;
    });

    it('should logout successfully', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Verify refresh token is revoked
      const rt = await prismaService.refresh_tokens.findFirst({
        where: { token: refreshToken },
      });
      expect(rt?.is_revoked).toBe(true);
    });

    it('should throw error without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/logout-all', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Create a test user and login
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      const user = await prismaService.users.create({
        data: {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          password: hashedPassword,
          email_verified: true,
          is_active: true,
        },
      });

      // Create multiple refresh tokens
      await prismaService.refresh_tokens.createMany({
        data: [
          {
            token: 'refresh-token-1',
            user_id: user.id,
            expires_at: new Date(Date.now() + 86400000),
          },
          {
            token: 'refresh-token-2',
            user_id: user.id,
            expires_at: new Date(Date.now() + 86400000),
          },
        ],
      });

      accessToken = jwtService.sign({ sub: user.id, email: user.email });
    });

    it('should logout all sessions successfully', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify all refresh tokens are revoked
      const rts = await prismaService.refresh_tokens.findMany({
        where: { user_id: '123' },
      });
      expect(rts.every((rt) => rt.is_revoked)).toBe(true);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    beforeEach(async () => {
      // Create a test user
      await prismaService.users.create({
        data: {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          password: await bcrypt.hash('Password123!', 10),
          email_verified: true,
          is_active: true,
        },
      });
    });

    it('should send password reset email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'john@example.com' })
        .expect(200);

      expect(response.body.message).toContain('Password reset email sent');
    });

    it('should return success message even for non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toContain('If that email exists');
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      const user = await prismaService.users.create({
        data: {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          password: hashedPassword,
          email_verified: true,
          is_active: true,
        },
      });

      accessToken = jwtService.sign({ sub: user.id, email: user.email });
    });

    it('should change password successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword123!',
        })
        .expect(200);

      expect(response.body.message).toContain('Password changed successfully');
    });

    it('should throw error for wrong current password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!',
        })
        .expect(400);

      expect(response.body.message).toContain('Current password incorrect');
    });

    it('should throw error without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword123!',
        })
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/verify-email', () => {
    let verificationToken: string;

    beforeEach(async () => {
      // Create a test user with verification token
      const user = await prismaService.users.create({
        data: {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          password: await bcrypt.hash('Password123!', 10),
          email_verified: false,
          email_verification_token: 'valid-token',
          email_verification_expiry: new Date(Date.now() + 3600000),
          is_active: true,
        },
      });
      verificationToken = user.email_verification_token;
    });

    it('should verify email successfully', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/auth/verify-email?token=${verificationToken}`)
        .expect(200);

      expect(response.body.message).toContain('Email verified successfully');

      // Verify email is marked as verified
      const user = await prismaService.users.findUnique({
        where: { email: 'john@example.com' },
      });
      expect(user?.email_verified).toBe(true);
    });

    it('should throw error for invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/verify-email?token=invalid-token')
        .expect(400);

      expect(response.body.message).toContain('Invalid verification token');
    });
  });

  describe('MFA endpoints', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      const user = await prismaService.users.create({
        data: {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          password: hashedPassword,
          email_verified: true,
          is_active: true,
        },
      });

      accessToken = jwtService.sign({ sub: user.id, email: user.email });
    });

    describe('POST /api/v1/auth/mfa/setup', () => {
      it('should setup MFA successfully', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/mfa/setup')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('secret');
        expect(response.body).toHaveProperty('qrCodeUri');
        expect(response.body).toHaveProperty('backupCodes');
      });

      it('should throw error without authentication', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/auth/mfa/setup')
          .expect(401);
      });
    });

    describe('POST /api/v1/auth/mfa/verify', () => {
      it('should verify and enable MFA successfully', async () => {
        // Setup MFA first
        const setupResponse = await request(app.getHttpServer())
          .post('/api/v1/auth/mfa/setup')
          .set('Authorization', `Bearer ${accessToken}`);

        const secret = setupResponse.body.secret;

        // Verify and enable MFA
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/mfa/verify')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ code: '123456' })
          .expect(200);

        expect(response.body.message).toContain('Two-factor authentication enabled');
      });

      it('should throw error for invalid code', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/auth/mfa/verify')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ code: '000000' })
          .expect(400);
      });
    });
  });

  describe('Account deletion endpoints', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      const user = await prismaService.users.create({
        data: {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          password: hashedPassword,
          email_verified: true,
          is_active: true,
        },
      });

      accessToken = jwtService.sign({ sub: user.id, email: user.email });
    });

    describe('POST /api/v1/auth/delete-account', () => {
      it('should request account deletion successfully', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/delete-account')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.message).toBeDefined();

        // Verify user is marked for deletion
        const user = await prismaService.users.findUnique({
          where: { email: 'john@example.com' },
        });
        expect(user?.delete_status).toBe('DELETE_REQUESTED');
        expect(user?.is_active).toBe(false);
      });

      it('should throw error without authentication', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/auth/delete-account')
          .expect(401);
      });
    });

    describe('POST /api/v1/auth/cancel-delete-account', () => {
      beforeEach(async () => {
        // Mark user for deletion
        await prismaService.users.update({
          where: { email: 'john@example.com' },
          data: {
            delete_status: 'DELETE_REQUESTED',
            is_active: false,
          },
        });
      });

      it('should cancel account deletion successfully', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/cancel-delete-account')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.message).toBeDefined();

        // Verify deletion is cancelled
        const user = await prismaService.users.findUnique({
          where: { email: 'john@example.com' },
        });
        expect(user?.delete_status).toBe('ACTIVE');
        expect(user?.is_active).toBe(true);
      });
    });
  });
});
