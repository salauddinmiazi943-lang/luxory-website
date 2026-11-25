import { User } from "@/lib/models";

export async function hasEmployeeIdUniqueIndex() {
  const indexes = await User.collection.indexes();
  return indexes.some((index) =>
    Object.keys(index.key).length === 1 &&
    index.unique === true &&
    index.sparse === true &&
    index.key.employeeId === 1
  );
}
