import * as admin from 'firebase-admin';
import { UserImportRecord } from 'firebase-admin/lib/auth/user-import-builder';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(__dirname, '../service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});

const dataDirectory = path.join(__dirname, '../data');

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

const importUserChunk = async (chunk: UserImportRecord[]) => {
  try {
    const results = await admin.auth().importUsers(
      chunk,
      {
        hash: { 
          // IMPORTANT: Use the same password hash parameters. Refer to configuration in Firebase Console. 
          // If you were using the default Firebase configuration, just fill in the signer key and salt separator.
          // Use the signer key and salt separator from the Firebase Console under Firebase Authentication -> Users -> Click on the three dots -> password hash parameters
          algorithm: 'SCRYPT',
          key: Buffer.from('<base64-signer-key>', 'base64'),
          saltSeparator: Buffer.from('<base64-salt-separator>', 'base64'),
          rounds: 8,
          memoryCost: 14,
        },
      },
    );

    results.errors.forEach((indexedError) => {
      console.log(`Error importing user ${indexedError.index}:`, indexedError.error);
    });
  } catch (error) {
    console.log('Error importing users:', error);
  }
};

const importUsersFromFile = async (filePath: string) => {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const users: UserImportRecord[] = JSON.parse(fileContent).map(
    (user: any) => {
      const userData: UserImportRecord = { ...user };
      if (user.passwordHash) {
        userData.passwordHash = Buffer.from(user.passwordHash, "base64");
      }
      if (user.passwordSalt) {
        userData.passwordSalt = Buffer.from(user.passwordSalt, "base64");
      } else if (user.passwordSalt === '') {
        userData.passwordSalt = Buffer.alloc(0);
      }
      return userData;
    }
  );

  const userChunks = chunkArray(users, 1000);
  for (const chunk of userChunks) {
    await importUserChunk(chunk);
  }
};

const importAllUsers = async () => {
  const files = fs.readdirSync(dataDirectory).filter((file) => file.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(dataDirectory, file);
    await importUsersFromFile(filePath);
  }
};

importAllUsers().then(() => {
  console.log('All users imported successfully');
}).catch((error) => {
  console.error('Error importing users:', error);
});
