// A folder holds items (e.g. one per MPN); each item has its images in slide order.
export type ItemImage = { url: string; label: string };

export type Item = {
  id: string;
  title: string;
  attributes?: Record<string, string>;
  images: ItemImage[];
};

export type Status = "pending" | "approved" | "rejected";
