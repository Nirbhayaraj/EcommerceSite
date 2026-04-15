import mongoose from "mongoose";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";
import connectCloudinary from "../config/cloudinary.js";
import connectDB from "../config/mongodb.js";
import productModel from "../models/productModel.js";

const categories = ["Men", "Women", "Kids"];
const subCategories = ["Topwear", "Bottomwear", "Winterwear"];
const styleWords = [
  "Urban",
  "Classic",
  "Coastal",
  "Everyday",
  "Modern",
  "Heritage",
  "Weekend",
  "Essential",
  "Street",
  "Summit"
];
const colorWords = [
  "Black",
  "Navy",
  "Olive",
  "Sand",
  "Wine",
  "Grey",
  "Blue",
  "Brown",
  "Cream",
  "Teal"
];
const productTypes = {
  Topwear: ["T-Shirt", "Shirt", "Polo", "Henley", "Overshirt"],
  Bottomwear: ["Jeans", "Joggers", "Chinos", "Shorts", "Cargo Pants"],
  Winterwear: ["Hoodie", "Jacket", "Sweater", "Puffer", "Fleece"]
};
const basePrices = {
  Topwear: 799,
  Bottomwear: 1099,
  Winterwear: 1499
};
const sizeSets = {
  Men: ["S", "M", "L", "XL", "XXL"],
  Women: ["S", "M", "L", "XL"],
  Kids: ["S", "M", "L"]
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendAssetsDir = path.resolve(__dirname, "../../Frontend/src/assets");

const getSeedImageFiles = async () => {
  const assetFiles = await fs.readdir(frontendAssetsDir);

  return assetFiles
    .filter((file) => /^p_img[\d_]+\.png$/i.test(file))
    .sort((first, second) =>
      first.localeCompare(second, undefined, {
        numeric: true,
        sensitivity: "base"
      })
    )
    .map((file) => ({
      fileName: file,
      filePath: path.join(frontendAssetsDir, file),
      publicId: `ecommerce-seed/${path.parse(file).name}`
    }));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const uploadSingleImage = async ({ filePath, publicId, fileName }, attempt = 1) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      public_id: publicId,
      overwrite: true,
      resource_type: "image"
    });

    return result.secure_url;
  } catch (error) {
    if (attempt >= 3) {
      throw new Error(`Image upload failed for ${fileName}: ${error.message}`);
    }

    await wait(attempt * 1500);
    return uploadSingleImage({ filePath, publicId, fileName }, attempt + 1);
  }
};

const uploadSeedImages = async (imageFiles) => {
  const uploadResults = [];

  for (const [index, imageFile] of imageFiles.entries()) {
    const uploadedUrl = await uploadSingleImage(imageFile);
    uploadResults.push(uploadedUrl);

    if ((index + 1) % 10 === 0 || index === imageFiles.length - 1) {
      console.log(`Uploaded ${index + 1}/${imageFiles.length} images`);
    }
  }

  return uploadResults;
};

const buildDescription = ({ category, subCategory, productType, color }) =>
  `${color} ${productType.toLowerCase()} for ${category.toLowerCase()} shoppers, made for easy daily styling with a clean ${subCategory.toLowerCase()} fit and all-day comfort.`;

const buildProducts = (uploadedImageUrls) =>
  Array.from({ length: 50 }, (_, index) => {
    const category = categories[index % categories.length];
    const subCategory = subCategories[index % subCategories.length];
    const typeOptions = productTypes[subCategory];
    const style = styleWords[index % styleWords.length];
    const color = colorWords[(index * 2) % colorWords.length];
    const productType = typeOptions[Math.floor(index / categories.length) % typeOptions.length];
    const productNumber = String(index + 1).padStart(2, "0");
    const name = `${style} ${color} ${productType} ${productNumber}`;
    const price =
      basePrices[subCategory] +
      (index % 5) * 120 +
      (category === "Women" ? 80 : 0) +
      (category === "Kids" ? -90 : 0);

    return {
      name,
      description: buildDescription({ category, subCategory, productType, color }),
      price,
      image: [
        uploadedImageUrls[index % uploadedImageUrls.length],
        uploadedImageUrls[(index + 1) % uploadedImageUrls.length]
      ],
      category,
      subCategory,
      sizes: sizeSets[category],
      bestseller: index % 6 === 0,
      date: Date.now() - index * 60_000
    };
  });

const seedProducts = async () => {
  await connectDB();
  await connectCloudinary();

  const imageFiles = await getSeedImageFiles();
  if (imageFiles.length < 2) {
    throw new Error("At least 2 seed image files are required in Frontend/src/assets");
  }

  console.log(`Uploading ${imageFiles.length} seed images to Cloudinary...`);
  const uploadedImageUrls = await uploadSeedImages(imageFiles);
  const products = buildProducts(uploadedImageUrls);
  const operations = products.map((product) => ({
    updateOne: {
      filter: { name: product.name },
      update: {
        $set: {
          description: product.description,
          price: product.price,
          image: product.image,
          category: product.category,
          subCategory: product.subCategory,
          sizes: product.sizes,
          bestseller: product.bestseller
        },
        $setOnInsert: {
          name: product.name,
          date: product.date,
          reviews: [],
          averageRating: 0,
          totalReviews: 0
        }
      },
      upsert: true
    }
  }));

  const result = await productModel.bulkWrite(operations, { ordered: false });
  const seededProducts = await productModel.countDocuments({
    name: { $regex: / \d{2}$/ }
  });

  console.log("Seed complete");
  console.log(`Image URLs prepared: ${uploadedImageUrls.length}`);
  console.log(`Inserted: ${result.upsertedCount}`);
  console.log(`Updated: ${result.modifiedCount}`);
  console.log(`Matched: ${result.matchedCount}`);
  console.log(`Seed-style products currently in DB: ${seededProducts}`);
};

seedProducts()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
