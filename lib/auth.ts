// lib/auth.ts - Enkel autentiseringslösning (kan uppgraderas till NextAuth senare)
import crypto from 'crypto';

export interface User {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  createdAt: string;
  emailVerified: boolean;
  subscription?: {
    plan: 'bas' | 'pro' | 'premium';
    status: 'active' | 'cancelled' | 'trial';
    startDate: string;
    endDate?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  };
  consent?: {
    termsAccepted: boolean;
    termsAcceptedAt: string;
    privacyAccepted: boolean;
    privacyAcceptedAt: string;
    marketingConsent: boolean;
  };
  resetPasswordToken?: string;
  resetPasswordExpires?: string;
}

// Enkel hash-funktion (använd bcrypt i produktion)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + process.env.PASSWORD_SALT || 'default-salt').digest('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// Cookie-hantering sker i API-routes, inte här
export async function getCurrentUserFromCookies(cookies: any): Promise<User | null> {
  const sessionToken = cookies.get('session_token')?.value;
  
  if (!sessionToken) return null;
  
  // Hämta användare från session
  const userId = cookies.get('user_id')?.value;
  if (!userId) return null;
  
  // Läs användardata (i produktion: från databas)
  try {
    const users = await importUserData();
    return users.find(u => u.id === userId) || null;
  } catch {
    return null;
  }
}

// Enkel filbaserad datalagring (ersätt med databas i produktion)
async function importUserData(): Promise<User[]> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'data', 'users.json');
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

export async function saveUserData(users: User[]) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'data', 'users.json');
    
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(users, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save user data:', error);
  }
}

export async function createUser(email: string, password: string, name?: string): Promise<User> {
  const users = await importUserData();
  
  // Kontrollera om användare redan finns
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Användare med denna e-post finns redan');
  }
  
  const user: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    name: name || email.split('@')[0],
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    emailVerified: false,
  };
  
  users.push(user);
  await saveUserData(users);
  
  return user;
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const users = await importUserData();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  
  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const users = await importUserData();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
  const users = await importUserData();
  const index = users.findIndex(u => u.id === userId);
  
  if (index === -1) return null;
  
  // Merge nested objects korrekt (speciellt för consent)
  const currentUser = users[index];
  const updatedUser: User = {
    ...currentUser,
    ...updates,
    // Merge consent om både current och updates har det
    consent: updates.consent 
      ? { ...currentUser.consent, ...updates.consent }
      : currentUser.consent || updates.consent,
  };
  
  users[index] = updatedUser;
  await saveUserData(users);
  
  return updatedUser;
}

export async function createResetToken(email: string): Promise<string | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date();
  expires.setHours(expires.getHours() + 1); // 1 timme
  
  await updateUser(user.id, {
    resetPasswordToken: token,
    resetPasswordExpires: expires.toISOString(),
  });
  
  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const users = await importUserData();
  const user = users.find(u => 
    u.resetPasswordToken === token && 
    u.resetPasswordExpires && 
    new Date(u.resetPasswordExpires) > new Date()
  );
  
  if (!user) return false;
  
  await updateUser(user.id, {
    passwordHash: hashPassword(newPassword),
    resetPasswordToken: undefined,
    resetPasswordExpires: undefined,
  });
  
  return true;
}
