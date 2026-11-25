import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Order, Product, ProductComment, ProductRecoveryArchive, StockMovement, User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };
const confirmationSchema = z.object({ confirmation: z.literal("permanently-delete") });

function hashSnapshot(snapshot: unknown) {
  const serialized = JSON.stringify(snapshot);
  if (serialized === undefined) throw new Error("Could not serialize product backup");
  return createHash("sha256").update(serialized).digest("hex");
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await requireUser(["super_admin"]);
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(_request, confirmationSchema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return Response.json({ error: "Invalid product id" }, { status: 400 });
    await connectDb();

    const product = await Product.findOne({ _id: id, deletedAt: { $exists: true } });
    if (!product) return Response.json({ error: "Deleted product not found" }, { status: 404 });

    const [orderSnapshots, cartEntries, comments, stockMovements] = await Promise.all([
      Order.countDocuments({ "items.productId": product._id }),
      User.countDocuments({ "cart.productId": product._id }),
      ProductComment.countDocuments({ product: product._id }),
      StockMovement.countDocuments({ productId: product._id }),
    ]);
    const snapshot = product.toObject({ depopulate: true, virtuals: false });
    const snapshotHash = hashSnapshot(snapshot);
    const archive = await ProductRecoveryArchive.create({
      productId: product._id,
      snapshot,
      snapshotHash,
      archivedAt: new Date(),
      archivedBy: new mongoose.Types.ObjectId(access.user.id),
      archivedByName: access.user.name,
      relationships: { orderSnapshots, cartEntries, comments, stockMovements },
    });

    const verifiedArchive = await ProductRecoveryArchive.findById(archive._id).lean();
    const verifiedSnapshot = verifiedArchive?.snapshot;
    const verifiedSnapshotId = typeof verifiedSnapshot === "object" && verifiedSnapshot !== null && "_id" in verifiedSnapshot
      ? String(verifiedSnapshot._id)
      : "";
    if (
      !verifiedArchive
      || verifiedSnapshotId !== String(product._id)
      || verifiedArchive.snapshotHash !== snapshotHash
      || hashSnapshot(verifiedSnapshot) !== snapshotHash
    ) {
      return Response.json({ error: "Backup verification failed; the product was not permanently deleted." }, { status: 500 });
    }

    const currentOrderSnapshots = await Order.countDocuments({ "items.productId": product._id });
    if (currentOrderSnapshots !== orderSnapshots) {
      return Response.json({
        error: "Order references changed during backup; the product was not permanently deleted.",
        archiveId: String(archive._id),
      }, { status: 409 });
    }

    const deletion = await Product.deleteOne({
      _id: product._id,
      deletedAt: product.deletedAt,
      __v: product.__v,
    });
    if (deletion.deletedCount !== 1) {
      return Response.json({
        error: "The product changed during backup; the verified backup was retained and the product was not permanently deleted.",
        archiveId: String(archive._id),
      }, { status: 409 });
    }

    return Response.json({
      success: true,
      archiveId: String(archive._id),
      retainedOrderSnapshots: orderSnapshots,
      retainedCartEntries: cartEntries,
      retainedComments: comments,
      retainedStockMovements: stockMovements,
      imagesRetained: true,
    });
  } catch (error) {
    return apiError(error);
  }
}
