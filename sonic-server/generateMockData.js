import { faker } from '@faker-js/faker';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const NUM_RECORDS = 10000;
const CATEGORIES = ["Electronics", "Clothing", "Sports", "Home", "Beauty"];
const OUTPUT_FILE = path.join(import.meta.dirname, 'generated_data.json');

console.log(`Starting data generation for ${NUM_RECORDS} records...`);

const writeStream = fs.createWriteStream(OUTPUT_FILE);

writeStream.on('finish', () => {
  console.log(`Successfully generated ${NUM_RECORDS} records to ${OUTPUT_FILE}`);
});

writeStream.on('error', (err) => {
  console.error('Error writing to file:', err);
});

writeStream.write('['); // Start of JSON array

for (let i = 0; i < NUM_RECORDS; i++) {
  const record = {
    _id: { $oid: new mongoose.Types.ObjectId().toHexString() },
    name: faker.commerce.productName(),
    description: faker.lorem.paragraphs({ min: 1, max: 3 }),
    price: parseFloat(faker.commerce.price({ min: 10, max: 2000, dec: 2 })),
    category: faker.helpers.arrayElement(CATEGORIES),
    createdAt: faker.date.past({ years: 2 }).toISOString(),
  };

  writeStream.write(JSON.stringify(record));

  if (i < NUM_RECORDS - 1) {
    writeStream.write(','); // Add comma if not the last record
  }

  if ((i + 1) % 10000 === 0) {
    console.log(`Generated ${i + 1} records...`);
  }
}

writeStream.write(']'); // End of JSON array
writeStream.end();

console.log('Data generation process initiated. Check console for progress and completion.');