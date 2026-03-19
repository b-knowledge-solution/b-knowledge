package com.example.service;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service for managing inventory items in the warehouse system.
 */
public class InventoryService {

    private final String warehouseId;
    private final List<InventoryItem> items;

    /**
     * Creates a new InventoryService for the specified warehouse.
     *
     * @param warehouseId the warehouse identifier
     */
    public InventoryService(String warehouseId) {
        this.warehouseId = warehouseId;
        this.items = new java.util.ArrayList<>();
    }

    /**
     * Find an inventory item by its SKU code.
     *
     * @param sku the stock keeping unit code
     * @return the matching item wrapped in Optional, or empty if not found
     */
    public Optional<InventoryItem> findBySku(String sku) {
        return items.stream()
            .filter(item -> item.getSku().equals(sku))
            .findFirst();
    }

    /**
     * Restock an item by adding the specified quantity.
     *
     * @param sku the stock keeping unit code
     * @param quantity the number of units to add
     * @return true if the item was found and restocked
     */
    public boolean restock(String sku, int quantity) {
        Optional<InventoryItem> item = findBySku(sku);
        if (item.isPresent()) {
            item.get().addQuantity(quantity);
            return true;
        }
        return false;
    }
}
