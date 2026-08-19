"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function str(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "1";
}

async function logActivity(
  linkedId: string,
  action: string,
  detail: string,
  linkedType = "company"
) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType, linkedId, action, detail },
  });
}

function readCompanyFields(formData: FormData) {
  return {
    name: str(formData, "name") ?? "Untitled company",
    type: str(formData, "type") ?? "customer",
    vertical: str(formData, "vertical"),
    priorityClient: bool(formData, "priorityClient"),
    phone: str(formData, "phone"),
    phoneExt: str(formData, "phoneExt"),
    cellPhone: str(formData, "cellPhone"),
    email: str(formData, "email"),
    website: str(formData, "website"),
    deliveryAddress: str(formData, "deliveryAddress"),
    billingAddress: str(formData, "billingAddress"),
    locationName: str(formData, "locationName"),
    zip: str(formData, "zip"),
    notes: str(formData, "notes"),
  };
}

export async function createCompany(formData: FormData) {
  const data = readCompanyFields(formData);
  const company = await prisma.company.create({ data });
  await logActivity(company.id, "company_created", `Company "${company.name}" created`);
  revalidatePath("/companies");
  redirect(`/companies/${company.id}`);
}

export async function updateCompany(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing company id");
  const data = readCompanyFields(formData);
  const company = await prisma.company.update({ where: { id }, data });
  await logActivity(company.id, "company_updated", `Company "${company.name}" updated`);
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  redirect(`/companies/${id}`);
}
