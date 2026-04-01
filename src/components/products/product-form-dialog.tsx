"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function generateShortCode(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const NEW_COLLECTION_VALUE = "__new__";

export function ProductFormDialog({
  product,
  children,
}: {
  product?: Doc<"products">;
  children: React.ReactElement;
}) {
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const existingCollections = useQuery(api.products.listCollections) ?? [];

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [shortCode, setShortCode] = useState(product?.shortCode ?? "");
  const [shortCodeManuallyEdited, setShortCodeManuallyEdited] = useState(false);
  const [description, setDescription] = useState(product?.description ?? "");
  const [collection, setCollection] = useState(product?.collection ?? "");
  const [isAddingNewCollection, setIsAddingNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [price, setPrice] = useState(product?.price?.toString() ?? "");
  const [status, setStatus] = useState<"active" | "discontinued" | "future_release">(
    product?.status ?? "active"
  );

  function resetForm() {
    if (!product) {
      setName("");
      setShortCode("");
      setShortCodeManuallyEdited(false);
      setDescription("");
      setCollection("");
      setIsAddingNewCollection(false);
      setNewCollectionName("");
      setPrice("");
      setStatus("active");
    }
  }

  function handleNameChange(newName: string) {
    setName(newName);
    if (!shortCodeManuallyEdited) {
      setShortCode(generateShortCode(newName));
    }
  }

  function handleCollectionChange(value: string) {
    if (value === NEW_COLLECTION_VALUE) {
      setIsAddingNewCollection(true);
      setCollection("");
      setNewCollectionName("");
    } else {
      setIsAddingNewCollection(false);
      setCollection(value);
    }
  }

  function handleConfirmNewCollection() {
    if (newCollectionName.trim()) {
      setCollection(newCollectionName.trim());
      setIsAddingNewCollection(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (product) {
      await updateProduct({
        id: product._id,
        name,
        shortCode: shortCode.toUpperCase(),
        description: description || undefined,
        collection: collection || null,
        price: parseFloat(price),
        status,
      });
    } else {
      await createProduct({
        name,
        shortCode: shortCode.toUpperCase(),
        description: description || undefined,
        collection: collection || undefined,
        price: parseFloat(price),
        status,
      });
    }
    setOpen(false);
    resetForm();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && product) {
          setName(product.name);
          setShortCode(product.shortCode ?? "");
          setShortCodeManuallyEdited(true);
          setDescription(product.description ?? "");
          setCollection(product.collection ?? "");
          setIsAddingNewCollection(false);
          setNewCollectionName("");
          setPrice(product.price.toString());
          setStatus(product.status);
        }
        if (!v) resetForm();
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {product ? "Edit Product" : "Create Product"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shortCode">Short Code</Label>
            <Input
              id="shortCode"
              value={shortCode}
              onChange={(e) => {
                setShortCode(e.target.value.toUpperCase().slice(0, 4));
                setShortCodeManuallyEdited(true);
              }}
              placeholder="e.g. MA"
              maxLength={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              Auto-generated from name. Used as prefix for batch codes.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Collection</Label>
            {isAddingNewCollection ? (
              <div className="flex gap-2">
                <Input
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="New collection name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConfirmNewCollection();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleConfirmNewCollection}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsAddingNewCollection(false);
                    setNewCollectionName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Select
                value={collection || "none"}
                onValueChange={(v) =>
                  handleCollectionChange(v === "none" || !v ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {collection || "No collection"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Collection</SelectItem>
                  {existingCollections.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_COLLECTION_VALUE}>
                    + Add new collection
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price (RM)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "active" | "discontinued" | "future_release")}
            >
              <SelectTrigger>
                <SelectValue>
                  {status === "future_release" ? "Future Release" : status.charAt(0).toUpperCase() + status.slice(1)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active" label="Active">Active</SelectItem>
                <SelectItem value="discontinued" label="Discontinued">Discontinued</SelectItem>
                <SelectItem value="future_release" label="Future Release">Future Release</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose
              render={<Button type="button" variant="outline" />}
            >
              Cancel
            </DialogClose>
            <Button type="submit">
              {product ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
