using UnityEngine;

// from brackeys inventory tutorial
public class ItemPickup : MonoBehaviour
{
    public string itemName = "Cube";

    void OnTriggerEnter(Collider other)
    {
        Debug.Log("picked up " + itemName);
        Destroy(gameObject);
    }
}
