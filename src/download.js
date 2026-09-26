// Saves a file (e.g. a Cloudinary photo) to the device without leaving the dashboard.
export async function downloadFile(url, name) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download");
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const extension = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg").split(";")[0];
  link.download = name || `snackit-${Date.now()}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
