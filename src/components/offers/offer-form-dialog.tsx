"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
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
import { Badge } from "@/components/ui/badge";
import { XIcon } from "lucide-react";

type ProductScope = "all" | "single" | "multiple" | "collection";

function detectProductScope(offer?: Doc<"offers">): ProductScope {
  if (offer?.productId) return "single";
  if (offer?.productIds && offer.productIds.length > 0) return "multiple";
  if (offer?.collection) return "collection";
  return "all";
}

export function OfferFormDialog({
  offer,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  offer?: Doc<"offers">;
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const createOffer = useMutation(api.offers.create);
  const updateOffer = useMutation(api.offers.update);
  const products = useQuery(api.products.list) ?? [];
  const agents = useQuery(api.users.listSellers) ?? [];
  const collections = useQuery(api.products.listCollections) ?? [];
  const sizes = useQuery(api.productVariants.listSizes) ?? [];

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [name, setName] = useState(offer?.name ?? "");
  const [description, setDescription] = useState(offer?.description ?? "");
  const [minQuantity, setMinQuantity] = useState(offer?.minQuantity?.toString() ?? "");
  const [bundlePrice, setBundlePrice] = useState(offer?.bundlePrice?.toString() ?? "");
  const [productScope, setProductScope] = useState<ProductScope>(detectProductScope(offer));
  const [singleProductId, setSingleProductId] = useState<string>(offer?.productId ?? "");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(offer?.productIds ?? []);
  const [selectedCollection, setSelectedCollection] = useState<string>(offer?.collection ?? "");
  const [selectedSizeMl, setSelectedSizeMl] = useState<string>(
    offer?.sizeMl != null ? offer.sizeMl.toString() : ""
  );
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(offer?.agentIds ?? []);
  const [isActive, setIsActive] = useState(offer?.isActive ?? true);

  function resetForm() {
    if (!offer) {
      setName("");
      setDescription("");
      setMinQuantity("");
      setBundlePrice("");
      setProductScope("all");
      setSingleProductId("");
      setSelectedProductIds([]);
      setSelectedCollection("");
      setSelectedSizeMl("");
      setSelectedAgentIds([]);
      setIsActive(true);
    }
  }

  function addProduct(productId: string) {
    if (productId && !selectedProductIds.includes(productId)) {
      setSelectedProductIds([...selectedProductIds, productId]);
    }
  }

  function removeProduct(productId: string) {
    setSelectedProductIds(selectedProductIds.filter((id) => id !== productId));
  }

  function addAgent(agentId: string) {
    if (agentId && !selectedAgentIds.includes(agentId)) {
      setSelectedAgentIds([...selectedAgentIds, agentId]);
    }
  }

  function removeAgent(agentId: string) {
    setSelectedAgentIds(selectedAgentIds.filter((id) => id !== agentId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fields = {
      name,
      description: description || undefined,
      minQuantity: parseInt(minQuantity),
      bundlePrice: parseFloat(bundlePrice),
      productId:
        productScope === "single" && singleProductId
          ? (singleProductId as Id<"products">)
          : undefined,
      productIds:
        productScope === "multiple" && selectedProductIds.length > 0
          ? (selectedProductIds as Id<"products">[])
          : undefined,
      collection:
        productScope === "collection" && selectedCollection
          ? selectedCollection
          : undefined,
      sizeMl: selectedSizeMl ? parseFloat(selectedSizeMl) : undefined,
      agentIds: selectedAgentIds.length > 0 ? (selectedAgentIds as Id<"users">[]) : [],
      isActive,
    };

    if (offer) {
      await updateOffer({ id: offer._id, ...fields });
    } else {
      await createOffer(fields);
    }
    setOpen(false);
    resetForm();
  }

  const productMap = new Map(products.map((p) => [p._id, p]));
  const agentMap = new Map(agents.map((a) => [a._id, a]));
  const availableProducts = products.filter(
    (p) =>
      !selectedProductIds.includes(p._id) &&
      (p.status === "active" || p.status === "future_release")
  );
  const availableAgents = agents.filter((a) => !selectedAgentIds.includes(a._id));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && offer) {
          setName(offer.name);
          setDescription(offer.description ?? "");
          setMinQuantity(offer.minQuantity.toString());
          setBundlePrice(offer.bundlePrice.toString());
          setProductScope(detectProductScope(offer));
          setSingleProductId(offer.productId ?? "");
          setSelectedProductIds(offer.productIds ?? []);
          setSelectedCollection(offer.collection ?? "");
          setSelectedSizeMl(offer.sizeMl != null ? offer.sizeMl.toString() : "");
          setSelectedAgentIds(offer.agentIds ?? []);
          setIsActive(offer.isActive);
        }
        if (!v) resetForm();
      }}
    >
      {children && <DialogTrigger render={children} />}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{offer ? "Edit Offer" : "Create Offer"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="offerName">Name</Label>
            <Input
              id="offerName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 3 Bottles for RM100"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="offerDescription">Description (optional)</Label>
            <Textarea
              id="offerDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details about this offer..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minQuantity">Min Quantity</Label>
              <Input
                id="minQuantity"
                type="number"
                min="1"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                placeholder="e.g. 3"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bundlePrice">Bundle Price (RM)</Label>
              <Input
                id="bundlePrice"
                type="number"
                step="0.01"
                min="0"
                value={bundlePrice}
                onChange={(e) => setBundlePrice(e.target.value)}
                placeholder="e.g. 100"
                required
              />
            </div>
          </div>

          {/* Product scope */}
          <div className="space-y-2">
            <Label>Eligible Products</Label>
            <Select
              value={productScope}
              onValueChange={(v) => setProductScope(v as ProductScope)}
            >
              <SelectTrigger>
                <SelectValue>
                  {productScope === "all" && "All Products"}
                  {productScope === "single" && "Single Product"}
                  {productScope === "multiple" && "Multiple Products"}
                  {productScope === "collection" && "By Collection"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="single">Single Product</SelectItem>
                <SelectItem value="multiple">Multiple Products</SelectItem>
                <SelectItem value="collection">By Collection</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {productScope === "single" && (
            <div className="space-y-2">
              <Label>Select Product</Label>
              <Select
                value={singleProductId}
                onValueChange={(v) => v && setSingleProductId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product...">
                    {singleProductId
                      ? (productMap.get(singleProductId as Id<"products">)?.name ?? "Select product...")
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {products
                    .filter((p) => p.status === "active" || p.status === "future_release")
                    .map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name}{p.status === "future_release" ? " (Future Release)" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {productScope === "multiple" && (
            <div className="space-y-2">
              <Label>Select Products</Label>
              {selectedProductIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedProductIds.map((id) => {
                    const product = productMap.get(id as Id<"products">);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {product?.name ?? "Unknown"}
                        <button type="button" onClick={() => removeProduct(id)} className="ml-1">
                          <XIcon className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              {availableProducts.length > 0 && (
                <Select value="" onValueChange={(v) => v && addProduct(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Add product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {productScope === "collection" && (
            <div className="space-y-2">
              <Label>Select Collection</Label>
              <Select
                value={selectedCollection}
                onValueChange={(v) => v && setSelectedCollection(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select collection..." />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Size filter */}
          <div className="space-y-2">
            <Label>Size Filter (optional)</Label>
            <Select
              value={selectedSizeMl}
              onValueChange={(v) => setSelectedSizeMl(!v || v === "__any__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue>
                  {selectedSizeMl ? `${selectedSizeMl} ML` : "Any size"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Any size</SelectItem>
                {sizes.map((s) => (
                  <SelectItem key={s} value={s.toString()}>
                    {s} ML
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Leave as &quot;Any size&quot; to apply to all sizes.
            </p>
          </div>

          {/* Eligible sellers */}
          <div className="space-y-2">
            <Label>Eligible Sellers</Label>
            <p className="text-xs text-muted-foreground">
              Leave empty to make available to all sellers.
            </p>
            {selectedAgentIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedAgentIds.map((id) => {
                  const agent = agentMap.get(id as Id<"users">);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1">
                      {agent?.name ?? "Unknown"}
                      <button type="button" onClick={() => removeAgent(id)} className="ml-1">
                        <XIcon className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            {availableAgents.length > 0 && (
              <Select value="" onValueChange={(v) => v && addAgent(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Add seller..." />
                </SelectTrigger>
                <SelectContent>
                  {availableAgents.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name ?? a.email ?? "Unnamed"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={isActive ? "active" : "inactive"}
              onValueChange={(v) => setIsActive(v === "active")}
            >
              <SelectTrigger>
                <SelectValue>
                  {isActive ? "Active" : "Inactive"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit">{offer ? "Save Changes" : "Create Offer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
