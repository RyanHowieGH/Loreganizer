"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useUserAuth } from "@/_utils/auth-context"; // Adjust path as needed
import {
  getCharacterWithInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "@/lib/firestore-helpers"; // Adjust path as needed
// Assuming these helpers exist and work. You might need to adjust implementation.
import { searchItems } from "@/lib/item-helpers"; // Adjust path as needed
import Link from "next/link";
import Navbar from "@/components/navbar"; // Adjust path as needed

// --- Mock Item Data & Search (Replace with your actual implementation) ---
// Example structure, adapt to your actual item data source (e.g., API fetch)
const MOCK_ITEMS_DB = [
    { index: 'club', name: 'Club', url: '/api/equipment/club', weight: 2, cost: { quantity: 1, unit: 'sp'}, weapon_category: { name: 'Simple Melee', index: 'simple-melee' }, damage: { damage_dice: '1d4', damage_type: { name: 'Bludgeoning', index: 'bludgeoning'} }, properties: [{ name: 'Light', index: 'light'}] },
    { index: 'dagger', name: 'Dagger', url: '/api/equipment/dagger', weight: 1, cost: { quantity: 2, unit: 'gp'}, weapon_category: { name: 'Simple Melee', index: 'simple-melee' }, damage: { damage_dice: '1d4', damage_type: { name: 'Piercing', index: 'piercing'} }, properties: [{ name: 'Finesse', index: 'finesse'}, {name: 'Light', index: 'light'}, {name: 'Thrown', index: 'thrown'}] },
    { index: 'potion-of-healing', name: 'Potion of Healing', url: '/api/equipment/potion-of-healing', weight: 0.5, cost: { quantity: 50, unit: 'gp'}, equipment_category: { name: 'Potion', index: 'potion'}, rarity: 'Common', description: 'You regain 2d4 + 2 hit points when you drink this potion.' },
    { index: 'leather-armor', name: 'Leather Armor', url: '/api/equipment/leather-armor', weight: 10, cost: { quantity: 10, unit: 'gp'}, equipment_category: { name: 'Light Armor', index: 'light-armor'}, rarity: 'Common' },
    { index: 'longsword', name: 'Longsword', url: '/api/equipment/longsword', weight: 3, cost: { quantity: 15, unit: 'gp'}, weapon_category: { name: 'Martial Melee', index: 'martial-melee'}, damage: { damage_dice: '1d8', damage_type: { name: 'Slashing', index: 'slashing'} }, properties: [{ name: 'Versatile', index: 'versatile', desc: ' (1d10)'}] },

];
// Basic mock search function
const localSearchItems = (term) => {
    if (!term || term.length < 2) return [];
    const lowerTerm = term.toLowerCase();
    // In a real app, fetch from an API: e.g., return fetch(`/api/items?search=${term}`).then(res => res.json());
    return MOCK_ITEMS_DB.filter(item => item.name.toLowerCase().includes(lowerTerm));
}
// --- End Mock ---


export default function CharacterInventoryPage({ params }) {
  // --- State Variables ---
  const resolvedParams = use(params); // Use hook for App Router params
  const { id: characterId } = resolvedParams;

  const { user } = useUserAuth();
  const router = useRouter();

  const [character, setCharacter] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true); // For initial page load
  const [actionLoading, setActionLoading] = useState(false); // For add/update/delete actions
  const [error, setError] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef(null); // Ref for detecting clicks outside suggestions

  // --- Effects ---

  // Load character and inventory data on mount or when user/characterId changes
  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        setLoading(false); // Stop loading if no user
        return; // Don't attempt to load if not logged in
      }
      if (!characterId) {
          console.warn("Character ID not available yet.");
          // setLoading(true); // Keep loading until ID is available
          return;
      }

      console.log(`Loading data for user: ${user.uid}, character: ${characterId}`);
      setLoading(true);
      setError(null);
      try {
        const { character: characterData, inventory: inventoryData } =
          await getCharacterWithInventory(user.uid, characterId);

        if (!characterData) {
            throw new Error("Character not found or access denied.");
        }

        setCharacter(characterData);
        // Ensure inventory is always an array
        setInventory(Array.isArray(inventoryData) ? inventoryData : []);
      } catch (err) {
        console.error("Failed to load character/inventory:", err);
        setError(err.message || "Failed to load character data.");
        setCharacter(null); // Ensure character is null on error
        setInventory([]);
        // Consider not redirecting immediately, let user see error
        // router.push("/characters");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, characterId, router]); // Dependencies for loading data

  // Handle clicks outside the suggestion box to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []); // No dependencies needed

  // Update suggestions when search term changes (debouncing recommended for real APIs)
  useEffect(() => {
    if (searchTerm.length > 1) {
      // In a real app, you might debounce this call
      const results = localSearchItems(searchTerm); // Use localSearchItems or your actual searchItems
      setSuggestions(results);
      // Keep suggestions visible if there are results and input is focused (handled by onFocus)
      // setShowSuggestions(results.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [searchTerm]);

  // --- Event Handlers ---

  const handleItemSelect = (item) => {
    console.log("Item selected:", item);
    setSelectedItem(item);
    setSearchTerm(item.name); // Update search bar text
    setShowSuggestions(false); // Hide suggestions
    setQuantity(1); // Reset quantity for the new item
  };

  const handleAddItem = async () => {
    if (!selectedItem || !characterId) return;

    setActionLoading(true);
    setError(null);

    try {
      // **Explicitly define the data structure to save to Firestore**
      // Avoid spreading unknown/complex objects from the source `selectedItem`
      const itemData = {
        // Core Fields
        name: selectedItem.name,
        quantity: Number(quantity) || 1,
        index: selectedItem.index || selectedItem.name.toLowerCase().replace(/\s+/g, '-'), // Good practice
        url: selectedItem.url || null,

        // Descriptive Fields (Safely access, provide defaults)
        description: selectedItem.description || "",
        rarity: selectedItem.rarity?.name || selectedItem.rarity || "common",
        type: selectedItem.type?.name || selectedItem.type || selectedItem.equipment_category?.name || "misc", // Prioritize type, fallback

        // Object/Complex Fields (Save structure Firestore expects/you need)
        // Ensure these are stored in a way that rendering logic can handle (e.g., objects with 'name')
        equipment_category: selectedItem.equipment_category || null, // e.g., { name: 'Potion', index: 'potion' }
        weapon_category: selectedItem.weapon_category || null,      // e.g., { name: 'Simple Melee', index: 'simple-melee' }
        cost: selectedItem.cost || null,                            // e.g., { quantity: 1, unit: 'sp' }
        damage: selectedItem.damage || null,                        // e.g., { damage_dice: '1d4', damage_type: { name: 'Bludgeoning', index: 'bludgeoning'} }
        properties: selectedItem.properties || [],                  // e.g., [{ name: 'Light', index: 'light'}]
        range: selectedItem.range || null,

        // Numeric Fields
        weight: selectedItem.weight ?? 0, // Use nullish coalescing for weight 0

        // Add timestamp for sorting/tracking if needed
        addedAt: new Date(),
      };

      console.log("Adding item data to Firestore:", itemData);

      const addedItem = await addInventoryItem(user.uid, characterId, itemData);

      // Prepend the new item to the inventory list for immediate feedback
      setInventory((prev) => [addedItem, ...prev].sort((a, b) => a.name.localeCompare(b.name))); // Optionally sort
      // Reset form state
      setSearchTerm("");
      setSelectedItem(null);
      setSuggestions([]);
      setQuantity(1);

    } catch (err) {
      console.error("Failed to add item:", err);
      setError(err.message || "Failed to add item to inventory.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateQuantity = async (itemId, newQuantity) => {
    if (!characterId) return;
    const quantityToUpdate = Math.max(1, newQuantity); // Ensure quantity is at least 1

    // --- Optimistic UI Update ---
    const originalInventory = [...inventory];
    setInventory((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, quantity: quantityToUpdate } : item
      )
    );
    // --- End Optimistic Update ---

    setActionLoading(true); // Indicate activity
    setError(null); // Clear previous action errors

    try {
      await updateInventoryItem(user.uid, characterId, itemId, {
        quantity: quantityToUpdate,
      });
      // Success: UI is already updated
    } catch (err) {
      console.error("Failed to update quantity:", err);
      setError(err.message || "Failed to update item quantity.");
      // Revert UI on failure
      setInventory(originalInventory);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveItem = async (itemId) => {
    if (!characterId || !confirm("Are you sure you want to remove this item?")) return;

    // --- Optimistic UI Update ---
    const originalInventory = [...inventory];
    setInventory((prev) => prev.filter((item) => item.id !== itemId));
     // --- End Optimistic Update ---

    setActionLoading(true);
    setError(null);

    try {
      await deleteInventoryItem(user.uid, characterId, itemId);
      // Success: UI is already updated
    } catch (err) {
      console.error("Failed to remove item:", err);
      setError(err.message || "Failed to remove item.");
      // Revert UI on failure
      setInventory(originalInventory);
    } finally {
      setActionLoading(false);
    }
  };

  // --- Render Logic ---

  // 1. Show Login Prompt if no user
  if (!user && !loading) { // Check loading to prevent flash of login prompt
    return (
      <div>
        <Navbar />
        <div className="hero min-h-screen bg-base-200">
          <div className="hero-content text-center">
            <div className="max-w-md">
              <h1 className="text-5xl font-bold">Please login</h1>
              <p className="py-6">You need to be logged in to view or manage inventory.</p>
              <Link href="/login" className="btn btn-primary">
                Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Show Loading Spinner during initial load ONLY
  if (loading && !character && !error) {
    return (
      <div>
        <Navbar />
        <div className="hero min-h-screen bg-base-200">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      </div>
    );
  }

  // 3. Show Error Page if initial loading failed or character not found
  if (error && !character && !actionLoading) { // Show only if not related to an action error
    return (
      <div>
        <Navbar />
        <div className="hero min-h-screen bg-base-200">
          <div className="alert alert-error max-w-lg mx-auto shadow-lg">
            <div>
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Error: {error}</span>
            </div>
            <div className="flex-none">
              <Link href="/characters" className="btn btn-sm btn-ghost">Go Back</Link>
              <button onClick={() => window.location.reload()} className="btn btn-sm btn-primary">Try Again</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

   // This state should ideally not be reached if error handling above is correct, but as a fallback:
   if (!character && !loading) {
       return (
           <div>
               <Navbar />
               <div className="hero min-h-screen bg-base-200">
                   <div className="text-center">
                       <h1 className="text-4xl font-bold">Character Not Found</h1>
                       <p className="py-6">Could not load character data.</p>
                       <Link href="/characters" className="btn btn-primary">Go to Characters</Link>
                   </div>
               </div>
           </div>
       );
   }


  // 4. Render Inventory Page
  return (
    <div>
      <Navbar />
      <div className="container mx-auto p-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
          <h1 className="text-3xl font-bold text-center sm:text-left">
            {character?.name}'s Inventory
          </h1>
          {characterId && (
            <Link href={`/characters/${characterId}`} className="btn btn-ghost">
              ← Back to Character Sheet
            </Link>
          )}
        </div>

        {/* Main Content Area */}
        <div className="bg-base-100 rounded-lg shadow-md p-4 sm:p-6">
          {/* Add New Item Form */}
          <div className="mb-6" ref={suggestionsRef}>
            <label htmlFor="item-search" className="label font-medium">Add Item</label>
            <div className="flex flex-col sm:flex-row gap-2 relative">
              {/* Search Input & Suggestions */}
              <div className="flex-1 relative">
                <input
                  id="item-search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSelectedItem(null); // Clear selection if user types again
                      if (e.target.value.length > 1) setShowSuggestions(true); // Show on type
                  }}
                  onFocus={() => {
                      // Show suggestions on focus only if there's already text/results
                      if (searchTerm.length > 1 && suggestions.length > 0) {
                          setShowSuggestions(true);
                      }
                  }}
                  placeholder="Search items (e.g., Longsword, Potion...)"
                  className="input input-bordered w-full"
                  disabled={actionLoading}
                  aria-label="Search for items to add"
                  autoComplete="off"
                />
                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full bg-base-200 border border-base-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {suggestions.map((item) => (
                      <li
                        key={item.index || item.name} // Prefer unique index
                        className="px-4 py-2 hover:bg-primary hover:text-primary-content cursor-pointer"
                        onClick={() => handleItemSelect(item)}
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleItemSelect(item)}
                      >
                        <div className="font-medium">{item.name}</div>
                        {/* Display helpful tags safely */}
                        <div className="text-sm opacity-80">
                          {item.equipment_category?.name || item.type?.name || item.type || 'Item'}
                          {item.weapon_category?.name && ` • ${item.weapon_category.name}`}
                          {item.rarity?.name || item.rarity && ` • ${item.rarity?.name || item.rarity}`}
                          {item.weight != null && ` • ${item.weight} lbs`}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {/* Quantity and Add Button */}
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="input input-bordered w-20"
                  disabled={actionLoading || !selectedItem}
                  aria-label="Quantity to add"
                />
                <button
                  onClick={handleAddItem}
                  className={`btn btn-primary ${actionLoading ? 'loading' : ''}`}
                  disabled={actionLoading || !selectedItem}
                >
                  {actionLoading ? "Adding..." : "Add"}
                </button>
              </div>
            </div>
          </div>

          {/* Action Error Display (minor errors during add/update/delete) */}
          {error && actionLoading && (
             <div className="alert alert-warning alert-sm mb-4 py-2 shadow-md">
                 <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <span>{error}</span>
                 </div>
                 <button onClick={() => setError(null)} className="btn btn-xs btn-ghost">Dismiss</button>
             </div>
          )}

          {/* Item Preview (Shown when an item is selected from suggestions) */}
          {selectedItem && (
            <div className="mb-6 p-4 bg-base-200 rounded-lg border border-base-300">
              <h3 className="font-bold text-lg mb-2">Preview: {selectedItem.name}</h3>
              <div className="text-sm space-y-1">
                 {/* Use optional chaining extensively for safe rendering */}
                <p>
                    {selectedItem.equipment_category?.name && <span>Category: {selectedItem.equipment_category.name}</span>}
                    {selectedItem.weapon_category?.name && <span className="ml-1">• Weapon Type: {selectedItem.weapon_category.name}</span>}
                    {(selectedItem.rarity?.name || selectedItem.rarity) && <span className="ml-1">• Rarity: {selectedItem.rarity?.name || selectedItem.rarity}</span>}
                    {selectedItem.weight != null && <span className="ml-1">• Weight: {selectedItem.weight} lbs</span>}
                </p>
                <p>
                    {selectedItem.cost?.quantity && selectedItem.cost?.unit && <span>Cost: {selectedItem.cost.quantity} {selectedItem.cost.unit}</span>}
                    {selectedItem.damage?.damage_dice && <span className="ml-1">• Damage: {selectedItem.damage.damage_dice} {selectedItem.damage.damage_type?.name || ''}</span>}
                    {selectedItem.range?.normal && <span className="ml-1">• Range: {selectedItem.range.normal} ft{selectedItem.range.long ? `/${selectedItem.range.long} ft` : ''}</span>}
                </p>
                {selectedItem.properties && selectedItem.properties.length > 0 && (
                    <p>
                        <span className="font-medium">Properties: </span>
                        {selectedItem.properties.map((prop) => prop?.name).filter(Boolean).join(", ")}
                    </p>
                )}
                {selectedItem.description && <p className="mt-2 italic text-gray-600">{selectedItem.description}</p>}
              </div>
            </div>
          )}

          {/* Current Inventory List */}
          <h2 className="text-2xl font-semibold mb-4 border-b pb-2">Current Inventory Items</h2>
          <div className="space-y-3">
            {/* Loading/Empty States for Inventory List */}
            {actionLoading && inventory.length > 0 && (
              <div className="text-center py-4"><span className="loading loading-dots loading-md text-primary"></span></div>
            )}
            {!loading && !actionLoading && inventory.length === 0 && (
              <p className="text-center py-8 text-gray-500">
                Inventory is empty. Use the search above to add items.
              </p>
            )}

            {/* Render Inventory Items */}
            {inventory.map((item) => (
              <div
                key={item.id} // Use Firestore document ID
                className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3 bg-base-200 rounded-lg shadow-sm"
              >
                {/* Item Details */}
                <div className="flex-1">
                  <h3 className="font-medium text-lg">{item.name}</h3>
                  {/* Display details using safe access */}
                  <div className="text-sm text-gray-600 mt-1 space-y-1">
                    <p>
                        {item.equipment_category?.name && <span>{item.equipment_category.name}</span>}
                        {item.weapon_category?.name && <span className="ml-1">• {item.weapon_category.name}</span>}
                        {(item.rarity?.name || item.rarity) && <span className="ml-1">• {item.rarity?.name || item.rarity}</span>}
                        {item.weight != null && <span className="ml-1">• {item.weight} lbs</span>}
                    </p>
                    <p>
                        {item.cost?.quantity && item.cost?.unit && <span>Cost: {item.cost.quantity} {item.cost.unit}</span>}
                        {item.damage?.damage_dice && <span className="ml-1">• Damage: {item.damage.damage_dice} {item.damage.damage_type?.name || ''}</span>}
                    </p>
                    {item.properties && item.properties.length > 0 && (
                       <p><span className="font-medium">Properties: </span>{item.properties.map((prop) => prop?.name).filter(Boolean).join(", ")}</p>
                    )}
                    {item.description && (
                       <p className="mt-1 italic text-xs">{item.description}</p>
                    )}
                  </div>
                </div>

                {/* Quantity Controls & Remove Button */}
                <div className="flex items-center gap-2 mt-2 sm:mt-0 self-center sm:self-auto">
                  <button
                    onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                    className="btn btn-sm btn-square btn-ghost"
                    disabled={actionLoading || item.quantity <= 1}
                    aria-label={`Decrease quantity of ${item.name}`}
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-semibold text-lg">{item.quantity}</span>
                  <button
                    onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                    className="btn btn-sm btn-square btn-ghost"
                    disabled={actionLoading}
                    aria-label={`Increase quantity of ${item.name}`}
                  >
                    +
                  </button>
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className={`btn btn-sm btn-error btn-outline ${actionLoading ? 'loading' : ''}`}
                    disabled={actionLoading}
                    aria-label={`Remove ${item.name}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}