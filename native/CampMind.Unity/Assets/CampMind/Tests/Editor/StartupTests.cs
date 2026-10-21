using CampMind.Presentation;
using NUnit.Framework;
namespace CampMind.Tests
{
    public class StartupTests
    {
        [TestCase(false,true,true,false,false)]
        [TestCase(true,false,true,false,false)]
        [TestCase(true,true,false,false,false)]
        [TestCase(true,true,true,true,false)]
        [TestCase(true,true,true,false,true)]
        public void EntryRequiresWorldModelsAndFirstVideoCycle(bool world,bool models,bool cycle,bool videoError,bool expected)
        {
            Assert.That(NativeStartup.CanEnter(world,models,cycle,videoError),Is.EqualTo(expected));
        }
    }
}
