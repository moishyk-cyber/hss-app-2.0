import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import { logActivity } from "../log";
import { createLineItemPricing } from "./pricing";
import { createFulfillment } from "./fulfillment";

import { createAttachments } from "./attachments";
import {
  uploadsConfigured, MAX_UPLOAD_BYTES, storagePathFor, createSignedUploadUrl,
  uploadObject, uploadedObjectInfo, removeObject
} from "../storage";


export const lineItemPricing = createLineItemPricing(prisma, {
  audit: logActivity,
  refresh: revalidatePath,
});

export const fulfillment = createFulfillment(prisma, {
  audit: (id, action, detail, meta) => logActivity("order", id, action, detail, meta),
  refresh: id => {
    for (const path of [`/orders/${id}`, "/orders", "/dashboard", "/deliveries"]) revalidatePath(path);
  },
});


export const attachments = createAttachments(prisma, {
  configured: uploadsConfigured,
  maxBytes: MAX_UPLOAD_BYTES,
  path: storagePathFor,
  sign: createSignedUploadUrl,
  upload: uploadObject,
  info: uploadedObjectInfo,
  remove: removeObject,
});
