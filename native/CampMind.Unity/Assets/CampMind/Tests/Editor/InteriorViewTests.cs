using CampMind.Presentation;
using NUnit.Framework;
using UnityEngine;

namespace CampMind.Tests
{
    public class InteriorViewTests
    {
        [Test]
        public void RoomObservationUsesAuthoredFootprintAndPlatformHeight()
        {
            var room=new InteriorRoom{center=new Vector3(50,8,-45),half=new Vector2(27,19),height=26};
            Assert.That(room.Contains(new Vector3(50,8,-45)),Is.True);
            Assert.That(room.Contains(new Vector3(50,0,-45)),Is.False);
            Assert.That(room.Contains(new Vector3(50,8,-25)),Is.False);
            Assert.That(room.Contains(new Vector3(50,35,-45)),Is.False);
        }
    }
}
